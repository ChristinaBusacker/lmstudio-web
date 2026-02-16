/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LmMessage, RunParams, StreamDelta } from '../common/types/llm.types';
import { SseBusService } from '../sse/sse-bus.service';
import { WebSearchService } from './web/web-search.service';
import { WebReaderService } from './web/web-reader.service';
import { DocReaderService } from './docs/doc-reader.service';

type AnyJson = Record<string, any>;

type ToolDef = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: AnyJson;
  };
};

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

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

  constructor(
    private readonly config: ConfigService,
    private readonly sse: SseBusService,
    private readonly webSearch: WebSearchService,
    private readonly webRead: WebReaderService,
    private readonly docRead: DocReaderService,
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

  private async execTool(
    runId: string,
    call: ToolCall,
  ): Promise<{ result: AnyJson; artifactId?: string | null }> {
    const name = call.function?.name;
    const rawArgs = call.function?.arguments ?? '{}';

    console.log('[TOOL CALL]', call.function.name, call.function.arguments);

    let args: AnyJson = {};
    const parseArgs = (input: unknown): AnyJson => {
      if (!input || typeof input !== 'string') return {};
      const raw = input.trim();

      // First attempt: raw JSON
      try {
        return JSON.parse(raw) as AnyJson;
      } catch {
        // continue
      }

      // Second attempt: decodeURIComponent (models sometimes emit urlencoded JSON)
      try {
        const decoded = decodeURIComponent(raw);
        return JSON.parse(decoded) as AnyJson;
      } catch {
        // continue
      }

      // Third attempt: extract the first {...} JSON object from a noisy string
      const m = /\{[\s\S]*\}/.exec(raw);
      if (m?.[0]) {
        const candidate = m[0];
        try {
          return JSON.parse(candidate) as AnyJson;
        } catch {
          try {
            return JSON.parse(decodeURIComponent(candidate)) as AnyJson;
          } catch {
            return {};
          }
        }
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
        args,
      },
    });

    if (name === 'web_search') {
      const out = await this.webSearch.search({
        q: String(args.q ?? ''),
        limit: typeof args.limit === 'number' ? args.limit : 5,
        runId,
      });
      console.log('[TOOL RESULT]', call.function.name, JSON.stringify(out).slice(0, 200));
      return { result: out as AnyJson, artifactId: out.artifactId };
    }

    if (name === 'web_read') {
      const out = await this.webRead.read({ url: String(args.url ?? ''), runId });
      return { result: out as AnyJson, artifactId: out.artifactId };
    }

    if (name === 'doc_read') {
      const out = await this.docRead.read({
        url: args.url ? String(args.url) : undefined,
        assetId: args.assetId ? String(args.assetId) : undefined,
        runId,
      });
      return { result: out as AnyJson, artifactId: out.artifactId };
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
  ): AsyncGenerator<StreamDelta, { content: string; stats?: any }, void> {
    const controller = new AbortController();
    this.controllers.set(runId, controller);

    const tools = this.getToolDefinitions();
    const maxRounds = 8;

    // We keep an internal message buffer that includes tool messages.
    const messages: AnyJson[] = baseMessages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.tool_call_id,
        };
      }
      return { role: m.role, content: m.content };
    });

    let full = '';
    let stats: any;

    try {
      for (let round = 0; round < maxRounds; round++) {
        const roundResult = yield* this.streamOneRound(runId, messages, params, tools, controller);
        full += roundResult.finalContent;
        stats = roundResult.usage ?? stats;

        if (!roundResult.toolCalls.length) return { content: full, stats };

        // Append assistant message that contains tool_calls (OpenAI format)
        messages.push({
          role: 'assistant',
          content: roundResult.finalContent ?? '',
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
          } catch (e: any) {
            const err = String(e?.message ?? e);
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
    messages: AnyJson[],
    params: RunParams,
    tools: ToolDef[],
    controller: AbortController,
  ): AsyncGenerator<
    StreamDelta,
    { finalContent: string; toolCalls: ToolCall[]; usage?: any },
    void
  > {
    void runId;
    let finalContent = '';

    // Streaming buffer
    let lineBuffer = '';

    // Tool call accumulation
    const toolCallsByIndex = new Map<number, ToolCall>();

    let usage: any;

    const body: AnyJson = {
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

        let payload: any;
        try {
          payload = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        const choice = payload?.choices?.[0];
        const delta = choice?.delta;

        const d = delta?.content;
        if (typeof d === 'string' && d.length > 0) {
          finalContent += d;
          yield { delta: d };
        }

        const tc = delta?.tool_calls;
        if (Array.isArray(tc)) {
          for (const t of tc) {
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

        if (payload?.usage && typeof payload.usage === 'object') {
          usage = payload.usage;
        }
      }
    }
    let toolCalls = Array.from(toolCallsByIndex.values()).filter((c) => !!c.function?.name);

    // Fallback: some models print tool calls into content instead of emitting structured tool_calls.
    // Example: "[TOOL CALL] doc_read { ...json... }"
    if (
      toolCalls.length === 0 &&
      typeof finalContent === 'string' &&
      finalContent.includes('[TOOL CALL]')
    ) {
      const re = /\[TOOL CALL\]\s*([a-zA-Z0-9_]+)\s*([\s\S]*?\{[\s\S]*\})/g;
      const matches: Array<{ name: string; args: string; full: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(finalContent))) {
        matches.push({ name: m[1], args: m[2].trim(), full: m[0] });
      }

      if (matches.length > 0) {
        toolCalls = matches.map((x, idx) => ({
          id: `call_fallback_${idx}`,
          type: 'function' as const,
          function: { name: x.name, arguments: x.args },
        }));

        // Strip the tool-call text from the assistant content to avoid polluting the chat output.
        for (const x of matches) {
          finalContent = finalContent.replace(x.full, '').trim();
        }
      }
    }

    return {
      finalContent,
      toolCalls,
      usage,
    };
  }
}
