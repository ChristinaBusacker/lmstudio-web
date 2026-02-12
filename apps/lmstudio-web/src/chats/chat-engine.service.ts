/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { LmMessage, RunParams, StreamDelta } from '../common/types/llm.types';
import { ConfigService } from '@nestjs/config';

interface StreamResult {
  content: string;
  stats?: any;
}

type AnyJson = Record<string, any>;

@Injectable()
export class ChatEngineService implements OnModuleDestroy {
  private readonly controllers = new Map<string, AbortController>();
  private baseUrl = 'http://127.0.0.1:1234';

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('LMSTUDIO_BASE_URL', 'http://127.0.0.1:1234');
  }

  cancel(runId: string) {
    this.controllers.get(runId)?.abort();
  }

  private flattenMessages(messages: LmMessage[]): string {
    return messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n');
  }

  private getStructuredConfig(params: RunParams): AnyJson | null {
    const so: any = (params as any)?.structuredOutput;
    if (!so || typeof so !== 'object') return null;
    if (so.enabled !== true) return null;

    // For strict, schema-enforced output, a JSON Schema object is required.
    if (!so.schema || typeof so.schema !== 'object') return null;

    return so as AnyJson;
  }

  async *streamChat(
    runId: string,
    messages: LmMessage[],
    params: RunParams,
  ): AsyncGenerator<StreamDelta, StreamResult, void> {
    const controller = new AbortController();
    this.controllers.set(runId, controller);

    try {
      // If structured output is enabled, switch to /v1/chat/completions (LM Studio documents schema enforcement there).
      const structured = this.getStructuredConfig(params);
      if (structured) {
        return yield* this.streamChatCompletions(messages, params, structured, controller);
      }

      // Otherwise keep the existing /v1/responses streaming behavior.
      return yield* this.streamResponses(messages, params, controller);
    } finally {
      this.controllers.delete(runId);
    }
  }

  /**
   * Default mode (text chat) using LM Studio's OpenAI-compatible /v1/responses endpoint.
   * (This is what the project used before Structured Output.)
   */
  private async *streamResponses(
    messages: LmMessage[],
    params: RunParams,
    controller: AbortController,
  ): AsyncGenerator<StreamDelta, StreamResult, void> {
    let full = '';
    let stats: any;

    // IMPORTANT: local line buffer (not shared across runs)
    let lineBuffer = '';

    const model = params.modelKey;

    // LM Studio: reasoning separation is controlled by `reasoning: { effort: ... }` for gpt-oss.
    const isGptOss = typeof model === 'string' && model.startsWith('openai/gpt-oss');

    const body: AnyJson = {
      model,
      input: this.flattenMessages(messages),
      temperature: params.temperature,
      max_output_tokens: params.maxTokens,
      top_p: params.topP,
      stream: true,
    };

    if (isGptOss) {
      body.reasoning = { effort: (params as any).reasoningEffort ?? 'medium' };
    }

    const res = await fetch(`${this.baseUrl}/v1/responses`, {
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
        if (line === 'data: [DONE]') {
          return { content: full, stats };
        }

        let payload: any;
        try {
          payload = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        // Visible output text
        if (payload?.type === 'response.output_text.delta') {
          const d = payload.delta;
          if (typeof d !== 'string' || d.length === 0) continue;

          full += d;
          yield { delta: d };
          continue;
        }

        // Reasoning channel (raw CoT) for gpt-oss (and compatible servers).
        if (payload?.type === 'response.reasoning_text.delta') {
          const rd = payload.delta;
          if (typeof rd !== 'string' || rd.length === 0) continue;

          yield { delta: '', reasoningDelta: rd };
          continue;
        }

        // Reasoning summary channel (some servers emit this instead/as well).
        if (payload?.type === 'response.reasoning_summary_text.delta') {
          const rd = payload.delta;
          if (typeof rd !== 'string' || rd.length === 0) continue;

          yield { delta: '', reasoningDelta: rd };
          continue;
        }

        // Completed
        if (payload?.type === 'response.completed') {
          stats = payload?.response?.usage ?? payload?.response ?? null;
          continue;
        }
      }
    }

    return { content: full, stats };
  }

  /**
   * Structured Output mode using LM Studio's OpenAI-compatible /v1/chat/completions endpoint.
   * LM Studio documents json_schema enforcement on this endpoint.
   */
  private async *streamChatCompletions(
    messages: LmMessage[],
    params: RunParams,
    structured: AnyJson,
    controller: AbortController,
  ): AsyncGenerator<StreamDelta, StreamResult, void> {
    let full = '';
    let stats: any;

    // IMPORTANT: local line buffer (not shared across runs)
    let lineBuffer = '';

    const body: AnyJson = {
      model: params.modelKey,
      messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: true,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: typeof structured.name === 'string' ? structured.name : 'structured_response',
          strict: structured.strict !== false,
          schema: structured.schema,
        },
      },
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
        if (line === 'data: [DONE]') {
          return { content: full, stats };
        }

        let payload: any;
        try {
          payload = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        // Typical OpenAI-compatible delta for chat.completions streaming
        const d = payload?.choices?.[0]?.delta?.content;
        if (typeof d === 'string' && d.length > 0) {
          full += d;
          yield { delta: d };
          continue;
        }

        // Usage can appear on the last chunk in some implementations
        const usage = payload?.usage;
        if (usage && typeof usage === 'object') {
          stats = usage;
        }
      }
    }

    return { content: full, stats };
  }

  onModuleDestroy() {
    this.controllers.forEach((c) => c.abort());
  }
}
