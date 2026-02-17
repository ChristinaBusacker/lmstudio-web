import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LmMessage, RunParams, StreamDelta } from '../common/types/llm.types';
import { SseBusService } from '../sse/sse-bus.service';
import { DocReaderService } from './docs/doc-reader.service';
import { JsonToolsService } from './utils/json-tools.service';
import { MathToolsService } from './utils/math-tools.service';
import { TimeToolsService } from './utils/time-tools.service';
import { WebReaderService } from './web/web-reader.service';
import { WebSearchService } from './web/web-search.service';

import type {
  ChatCompletionChunk,
  ChatRequestMessage,
  JsonObject,
  ToolCall,
  ToolDef,
} from '@shared/index';
import { isRecord, safeJsonParse, toJsonObject } from '../utils/typed-access';

/**
 * ToolOrchestratorService
 *
 * Implements an OpenAI-style tool loop using LM Studio's OpenAI-compatible
 * /v1/chat/completions endpoint.
 *
 * - streams assistant text deltas
 * - detects tool_calls and executes them via backend tools
 * - feeds tool results back into the model until a final answer is produced
 * - emits SSE events for tool calls/results/errors
 */
@Injectable()
export class ToolOrchestratorService {
  private baseUrl = 'http://127.0.0.1:1234';
  private readonly controllers = new Map<string, AbortController>();

  private readonly TOOL_SYSTEM_PROMPT = `You have access to external tools for up-to-date information:
- web_search(q, limit): search the web for recent information.
- web_read(url): read and extract the main text from a webpage URL.
- doc_read(assetId): read an uploaded document by assetId.
 - current_time(timezone?): get the current time and timezone-aware ISO string.
 - resolve_relative_date(text, timezone?): resolve relative expressions like "yesterday" or "next Friday" to a concrete ISO datetime.
 - date_math(base, add/subtract, startOf/endOf, timezone?): deterministic date arithmetic.
 - math(expression, variables?, precision?): deterministic calculator.
 - json_validate(json, schema): validate JSON against JSON Schema.
 - json_repair(text): repair JSON-ish text into valid JSON when possible.

Rules:
- When the user asks for current events, news, live data, or anything beyond your training cutoff, you MUST use web_search/web_read instead of refusing.
- If tool results are present in this conversation, treat them as authoritative input and answer using them.
- Do NOT claim you "can't browse" or "don't have access" when tools and tool results are available.
- Do NOT print tool-call syntax as plain text (e.g. "<|channel|>... to=browser.search ..." or "browser.search(...)"). Use the provided tools via tool calling.
- Only refuse if tool execution fails or returns no usable results.`;

  constructor(
    private readonly config: ConfigService,
    private readonly sse: SseBusService,
    private readonly webSearch: WebSearchService,
    private readonly webRead: WebReaderService,
    private readonly docRead: DocReaderService,
    private readonly timeTools: TimeToolsService,
    private readonly mathTools: MathToolsService,
    private readonly jsonTools: JsonToolsService,
  ) {
    this.baseUrl = this.config.get<string>('LMSTUDIO_BASE_URL', 'http://127.0.0.1:1234');
  }

  cancel(runId: string) {
    this.controllers.get(runId)?.abort();
  }

  getToolDefinitions(): ToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'current_time',
          description:
            'Return the current date/time with timezone info. Use this before interpreting relative phrases like "yesterday".',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              timezone: {
                type: 'string',
                description: 'IANA timezone, e.g. Europe/Berlin. Defaults to Europe/Berlin.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'resolve_relative_date',
          description:
            'Resolve a human time expression (e.g., "yesterday", "next Friday 5pm", "in 3 hours") into a concrete ISO datetime.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: {
                type: 'string',
                description: 'The relative date/time expression to resolve.',
              },
              timezone: {
                type: 'string',
                description: 'IANA timezone, e.g. Europe/Berlin. Defaults to Europe/Berlin.',
              },
              baseTime: {
                type: 'string',
                description:
                  'Optional ISO datetime used as reference instead of now. If provided, should include timezone offset.',
              },
              forwardDate: {
                type: 'boolean',
                description:
                  'If true, ambiguous dates will be interpreted as future dates when possible. Default: true.',
                default: true,
              },
            },
            required: ['text'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'date_math',
          description:
            'Perform deterministic date math (add/subtract, startOf/endOf, rounding) in a given timezone.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              base: {
                type: 'string',
                description:
                  'Base ISO datetime. If omitted, uses now in the given timezone. Prefer including timezone offset.',
              },
              timezone: {
                type: 'string',
                description: 'IANA timezone, e.g. Europe/Berlin. Defaults to Europe/Berlin.',
              },
              add: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  years: { type: 'integer' },
                  months: { type: 'integer' },
                  weeks: { type: 'integer' },
                  days: { type: 'integer' },
                  hours: { type: 'integer' },
                  minutes: { type: 'integer' },
                  seconds: { type: 'integer' },
                },
              },
              startOf: {
                type: 'string',
                enum: ['day', 'week', 'month', 'year'],
              },
              endOf: {
                type: 'string',
                enum: ['day', 'week', 'month', 'year'],
              },
              roundTo: {
                type: 'string',
                enum: ['second', 'minute', 'hour', 'day'],
                description: 'Round to nearest unit in the given timezone.',
              },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'math',
          description:
            'Evaluate a mathematical expression deterministically. Supports +, -, *, /, %, **, parentheses, and common functions.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              expression: { type: 'string', description: 'Math expression, e.g. "(2+3)*4"' },
              variables: {
                type: 'object',
                description: 'Optional variables map used in the expression.',
                additionalProperties: { type: ['number', 'string'] },
              },
              precision: {
                type: 'integer',
                minimum: 0,
                maximum: 12,
                description: 'Optional rounding precision (decimal places).',
              },
            },
            required: ['expression'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'json_validate',
          description:
            'Validate JSON data against a JSON Schema and return detailed errors when invalid.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              json: {
                description: 'JSON value to validate (object/array/primitive) or a JSON string.',
              },
              schema: {
                type: 'object',
                description: 'JSON Schema (draft 7/2019-09 compatible via AJV).',
              },
            },
            required: ['schema', 'json'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'json_repair',
          description:
            'Repair JSON-ish text (single quotes, trailing commas, unquoted keys) into valid JSON when possible.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string', description: 'JSON-ish text to repair.' },
            },
            required: ['text'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'web_search',
          description:
            'Search the web and return a list of results (title, snippet, url, publishedAt when available).',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              q: { type: 'string', description: 'Search query' },
              limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
            },
            required: ['q'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'web_read',
          description:
            'Fetch a webpage and extract the main article text plus metadata (title, author, publishedAt, siteName).',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              url: { type: 'string', description: 'http/https URL' },
            },
            required: ['url'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'doc_read',
          description:
            'Read a document from an uploaded assetId. Supports ZIP archives (returns multiple entries). Returns a structured extraction result (text/json/code/pdf/docx/image).',
          parameters: {
            type: 'object',
            additionalProperties: false,
            description: 'Provide assetId of a previously uploaded file. URLs are not supported.',
            required: ['assetId'],
            properties: {
              assetId: {
                type: 'string',
                description: 'Uploaded asset id',
              },
            },
          },
        },
      },
    ];
  }

  /**
   * Execute a tool deterministically (without an LLM tool_call).
   * Useful for workflow nodes that explicitly define the tool + args.
   */
  async executeToolDirect(args: {
    runId: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
  }): Promise<{ result: JsonObject; artifactId?: string | null }> {
    const runId = args.runId;
    const name = String(args.toolName ?? '').trim();
    const toolArgs: Record<string, unknown> = isRecord(args.toolArgs) ? args.toolArgs : {};

    if (!name) throw new Error('toolName is required');

    // Use a synthetic toolCallId for SSE parity.
    const syntheticCall: ToolCall = {
      id: `workflow:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(toolArgs) },
    };

    return this.execTool(runId, syntheticCall);
  }

  private async execTool(
    runId: string,
    call: ToolCall,
  ): Promise<{ result: JsonObject; artifactId?: string | null }> {
    const name = call.function?.name;
    const rawArgs = call.function?.arguments ?? '{}';

    console.log('[TOOL CALL]', call.function.name, call.function.arguments);

    let args: Record<string, unknown> = {};
    const parseArgs = (input: unknown): Record<string, unknown> => {
      if (!input || typeof input !== 'string') return {};
      const raw = input.trim();

      // First attempt: raw JSON
      const parsed1 = safeJsonParse(raw);
      if (isRecord(parsed1)) return parsed1;

      // Second attempt: decodeURIComponent (models sometimes emit urlencoded JSON)
      try {
        const decoded = decodeURIComponent(raw);
        const parsed2 = safeJsonParse(decoded);
        if (isRecord(parsed2)) return parsed2;
      } catch {
        // continue
      }

      // Third attempt: extract the first {...} JSON object from a noisy string
      const m = /\{[\s\S]*\}/.exec(raw);
      if (m?.[0]) {
        const candidate = m[0];
        const parsed3 = safeJsonParse(candidate);
        if (isRecord(parsed3)) return parsed3;
        try {
          const decoded = decodeURIComponent(candidate);
          const parsed4 = safeJsonParse(decoded);
          if (isRecord(parsed4)) return parsed4;
        } catch {
          // ignore
        }
        return {};
      }

      return {};
    };

    args = parseArgs(rawArgs);

    // Emit tool call event
    this.sse.publishEphemeral({
      type: 'run.tool_call',
      runId,
      payload: {
        runId,
        toolCallId: call.id,
        toolName: name,
        args: args as JsonObject,
      },
    });

    if (name === 'web_search') {
      const out = await this.webSearch.search({
        q: String(args.q ?? ''),
        limit: typeof args.limit === 'number' ? args.limit : 5,
        runId,
      });
      console.log('[TOOL RESULT]', call.function.name, JSON.stringify(out).slice(0, 200));
      return { result: toJsonObject(out), artifactId: out.artifactId };
    }

    if (name === 'current_time') {
      const out = this.timeTools.currentTime({
        timezone: args.timezone ? String(args.timezone) : undefined,
      });
      return { result: toJsonObject(out), artifactId: null };
    }

    if (name === 'resolve_relative_date') {
      const out = this.timeTools.resolveRelativeDate({
        text: String(args.text ?? ''),
        timezone: args.timezone ? String(args.timezone) : undefined,
        baseTime: args.baseTime ? String(args.baseTime) : undefined,
        forwardDate: typeof args.forwardDate === 'boolean' ? args.forwardDate : true,
      });
      return { result: toJsonObject(out), artifactId: null };
    }

    if (name === 'date_math') {
      const out = this.timeTools.dateMath({
        base: args.base ? String(args.base) : undefined,
        timezone: args.timezone ? String(args.timezone) : undefined,
        add: isRecord(args.add) ? args.add : undefined,
        startOf: args.startOf ? String(args.startOf) : undefined,
        endOf: args.endOf ? String(args.endOf) : undefined,
        roundTo: args.roundTo ? String(args.roundTo) : undefined,
      });
      return { result: toJsonObject(out), artifactId: null };
    }

    if (name === 'math') {
      const out = this.mathTools.evaluate({
        expression: String(args.expression ?? ''),
        variables: isRecord(args.variables) ? args.variables : undefined,
        precision: typeof args.precision === 'number' ? args.precision : undefined,
      });
      return { result: toJsonObject(out), artifactId: null };
    }

    if (name === 'json_validate') {
      const schema = isRecord(args.schema) ? args.schema : {};
      const out = this.jsonTools.validate({ json: args.json, schema });
      return { result: toJsonObject(out), artifactId: null };
    }

    if (name === 'json_repair') {
      const out = this.jsonTools.repair({ text: String(args.text ?? '') });
      return { result: toJsonObject(out), artifactId: null };
    }

    if (name === 'web_read') {
      const out = await this.webRead.read({ url: String(args.url ?? ''), runId });
      return { result: toJsonObject(out), artifactId: out.artifactId };
    }

    if (name === 'doc_read') {
      const out = await this.docRead.read({
        assetId: args.assetId ? String(args.assetId) : undefined,
        runId,
      });
      return { result: toJsonObject(out), artifactId: out.artifactId };
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  /**
   * Streams assistant output. If the model calls tools, executes them and continues.
   */
  async *streamWithTools(
    runId: string,
    baseMessages: LmMessage[],
    params: RunParams,
  ): AsyncGenerator<StreamDelta, { content: string; stats?: Record<string, unknown> }, void> {
    const controller = new AbortController();
    this.controllers.set(runId, controller);
    const tools = this.getToolDefinitions();
    const maxRounds = 8;

    // We keep an internal message buffer that includes tool messages.
    const messages: ChatRequestMessage[] = baseMessages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.tool_call_id ?? '',
        };
      }
      if (m.role === 'assistant') return { role: 'assistant', content: m.content };
      return { role: m.role, content: m.content };
    });

    // Ensure the model is explicitly informed about tool access.
    // Many models will not call tools unless instructed, even if tools are provided in the API payload.
    if (
      messages.length === 0 ||
      messages[0].role !== 'system' ||
      !String(messages[0].content ?? '').includes('You have access to external tools')
    ) {
      messages.unshift({ role: 'system', content: this.TOOL_SYSTEM_PROMPT });
    }

    let full = '';
    let stats: Record<string, unknown> | undefined;

    try {
      for (let round = 0; round < maxRounds; round++) {
        const roundResult = yield* this.streamOneRound(runId, messages, params, tools, controller);
        full += roundResult.finalContent;
        stats = roundResult.usage ?? stats;

        if (!roundResult.toolCalls.length) return { content: full, stats };

        // Append assistant message that contains tool_calls (OpenAI format)
        messages.push({
          role: 'assistant',
          // IMPORTANT: When tool_calls are present, OpenAI-compatible servers often expect content to be null.
          // Some servers/models ignore tool results if the tool-calling assistant message had an empty string here.
          content: null,
          tool_calls: roundResult.toolCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.function.name, arguments: c.function.arguments },
          })),
        });

        // Execute tools in order and append tool messages
        for (const call of roundResult.toolCalls) {
          try {
            const { result, artifactId } = await this.execTool(runId, call);

            this.sse.publishEphemeral({
              type: 'run.tool_result',
              runId,
              payload: {
                runId,
                toolCallId: call.id,
                toolName: call.function.name,
                result,
                artifactId: artifactId ?? null,
              },
            });

            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(result),
            });
          } catch (e: unknown) {
            const err = e instanceof Error ? e.message : String(e);
            this.sse.publishEphemeral({
              type: 'run.tool_error',
              runId,
              payload: {
                runId,
                toolCallId: call.id,
                toolName: call.function?.name ?? 'unknown',
                error: err,
              },
            });

            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({ error: err }),
            });
          }
        }
      }

      // Safety: hit max rounds
      return { content: full, stats };
    } finally {
      this.controllers.delete(runId);
    }
  }

  private async *streamOneRound(
    runId: string,
    messages: ChatRequestMessage[],
    params: RunParams,
    tools: ToolDef[],
    controller: AbortController,
  ): AsyncGenerator<
    StreamDelta,
    { finalContent: string; toolCalls: ToolCall[]; usage?: Record<string, unknown> },
    void
  > {
    void runId;
    let finalContent = '';

    // Streaming buffer
    let lineBuffer = '';

    // Tool call accumulation
    const toolCallsByIndex = new Map<number, ToolCall>();

    let usage: Record<string, unknown> | undefined;

    const body: Record<string, unknown> = {
      model: params.modelKey,
      messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: true,
      tools,
      tool_choice: 'auto',
    };

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new Error(`LM Studio error ${res.status}: ${await res.text()}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      lineBuffer += chunk;

      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        if (line === 'data: [DONE]') break;

        const parsed = safeJsonParse(line.slice(6));
        if (!isRecord(parsed)) continue;

        const chunk = parsed as unknown as ChatCompletionChunk;
        const choice0 = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
        const delta = choice0?.delta;

        if (delta?.content && typeof delta.content === 'string') {
          finalContent += delta.content;
          yield { delta: delta.content };
        }

        if (Array.isArray(delta?.tool_calls)) {
          for (const t of delta.tool_calls) {
            const idx = typeof t.index === 'number' ? t.index : 0;
            const existing = toolCallsByIndex.get(idx) ?? {
              id: t.id ?? `call_${idx}`,
              type: 'function',
              function: { name: t.function?.name ?? '', arguments: '' },
            };

            if (t.id) existing.id = t.id;
            if (t.function?.name) existing.function.name = t.function.name;
            if (typeof t.function?.arguments === 'string') {
              existing.function.arguments += t.function.arguments;
            }

            toolCallsByIndex.set(idx, existing);
          }
        }

        if (chunk.usage && isRecord(chunk.usage)) {
          usage = chunk.usage;
        }
      }
    }
    let toolCalls = Array.from(toolCallsByIndex.values()).filter((c) => !!c.function?.name);

    // Fallback: some models print tool calls into content instead of emitting structured tool_calls.
    // We support multiple common formats to avoid being OpenAI-format dependent.
    //
    // Supported examples:
    // - "[TOOL CALL] web_search {\"q\":\"...\"}"
    // - "<|channel|>commentary to=browser.search code<|message|>{\"query\":\"...\",\"topn\":10}"
    // - "to=web_search { ... }" (some fine-tunes)
    if (toolCalls.length === 0 && typeof finalContent === 'string') {
      const extracted = this.extractToolCallsFromText(finalContent);
      if (extracted.toolCalls.length > 0) {
        toolCalls = extracted.toolCalls;
        finalContent = extracted.cleanedContent;
      }
    }

    return {
      finalContent,
      toolCalls,
      usage,
    };
  }

  /**
   * Extract tool calls from plain-text outputs.
   *
   * Many models (especially ones trained on other tool syntaxes) will output
   * "tool calls" as plain text instead of emitting OpenAI-style `tool_calls`.
   *
   * We try to recognize those patterns and convert them into our internal ToolCall format.
   */
  private extractToolCallsFromText(text: string): {
    toolCalls: ToolCall[];
    cleanedContent: string;
  } {
    let cleanedContent = text;
    const toolCalls: ToolCall[] = [];
    let counter = 0;

    const push = (nameRaw: string, argsRaw: string, fullMatch: string) => {
      const name = this.normalizeToolName(nameRaw);
      if (!name) return;

      const args = this.normalizeToolArgs(name, argsRaw);
      toolCalls.push({
        id: `call_text_${counter++}`,
        type: 'function',
        function: { name, arguments: args },
      });
      cleanedContent = cleanedContent.replace(fullMatch, '').trim();
    };

    // Pattern 1: [TOOL CALL] toolName {json}
    {
      const re = /\[TOOL CALL\]\s*([a-zA-Z0-9_\.]+)\s*([\s\S]*?\{[\s\S]*\})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        push(m[1], m[2].trim(), m[0]);
      }
    }

    // Pattern 2: "to=browser.search" (or browser.open) style with JSON payload
    // Example: <|channel|>commentary to=browser.search code<|message|>{"query":"...","topn":10}
    {
      const re = /to=(browser\.(search|open)|web_search|web_read|doc_read)\b[^\{]*?(\{[\s\S]*\})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        push(m[1], m[3].trim(), m[0]);
      }
    }

    return { toolCalls, cleanedContent };
  }

  private normalizeToolName(nameRaw: string): string | null {
    const n = String(nameRaw ?? '').trim();
    if (!n) return null;

    // Normalize common non-OpenAI syntaxes
    if (n === 'browser.search') return 'web_search';
    if (n === 'browser.open') return 'web_read';

    // Already supported
    if (n === 'web_search' || n === 'web_read' || n === 'doc_read') return n;
    return null;
  }

  /**
   * Normalize arguments from non-standard tool syntaxes to our tool schemas.
   *
   * - browser.search often uses { query, topn }
   * - browser.open often uses { url } (or sometimes { ref_id } – ignored here)
   */
  private normalizeToolArgs(toolName: string, argsRaw: string): string {
    const parseLoose = (raw: string): Record<string, unknown> => {
      const s = String(raw ?? '').trim();
      if (!s) return {};
      const parsed = safeJsonParse(s);
      if (isRecord(parsed)) return parsed;

      // Try to extract a JSON object from noise
      const m = /\{[\s\S]*\}/.exec(s);
      if (m?.[0]) {
        const extracted = safeJsonParse(m[0]);
        if (isRecord(extracted)) return extracted;
      }

      return {};
    };

    const obj = parseLoose(argsRaw);

    if (toolName === 'web_search') {
      const q = String(obj.q ?? obj.query ?? '').trim();
      const limit =
        typeof obj.limit === 'number'
          ? obj.limit
          : typeof obj.topn === 'number'
            ? obj.topn
            : undefined;
      return JSON.stringify({ q, ...(limit ? { limit } : {}) });
    }

    if (toolName === 'web_read') {
      const url = String(obj.url ?? obj.href ?? '').trim();
      return JSON.stringify({ url });
    }

    if (toolName === 'doc_read') {
      const assetId = String(obj.assetId ?? obj.asset_id ?? '').trim();
      return JSON.stringify({ assetId });
    }

    return JSON.stringify(obj);
  }
}
