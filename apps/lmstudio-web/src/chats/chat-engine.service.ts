/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';

type LmRole = 'system' | 'user' | 'assistant';
export interface LmMessage {
  role: LmRole;
  content: string;
}

export interface RunParams {
  modelKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;

  // Optional: expose this later via settings profile if you want
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface StreamDelta {
  delta: string;
  reasoningDelta?: string;
}

interface StreamResult {
  content: string;
  stats?: any;
}

@Injectable()
export class ChatEngineService {
  private readonly controllers = new Map<string, AbortController>();
  private readonly baseUrl = process.env.LMSTUDIO_BASE_URL ?? 'http://127.0.0.1:1234';

  cancel(runId: string) {
    this.controllers.get(runId)?.abort();
  }

  private flattenMessages(messages: LmMessage[]): string {
    return messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n');
  }

  async *streamChat(
    runId: string,
    messages: LmMessage[],
    params: RunParams,
  ): AsyncGenerator<StreamDelta, StreamResult, void> {
    const controller = new AbortController();
    this.controllers.set(runId, controller);

    let full = '';
    let stats: any;

    // IMPORTANT: local line buffer (not shared across runs)
    let lineBuffer = '';

    try {
      const model = params.modelKey;

      // LM Studio: reasoning separation is controlled by `reasoning: { effort: ... }` for gpt-oss. :contentReference[oaicite:2]{index=2}
      const isGptOss = typeof model === 'string' && model.startsWith('openai/gpt-oss');

      const body: any = {
        model,
        input: this.flattenMessages(messages),
        temperature: params.temperature,
        max_output_tokens: params.maxTokens,
        top_p: params.topP,
        stream: true,
      };

      if (isGptOss) {
        body.reasoning = { effort: params.reasoningEffort ?? 'medium' };
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

          // Reasoning channel (raw CoT) for gpt-oss (and compatible servers). :contentReference[oaicite:3]{index=3}
          if (payload?.type === 'response.reasoning_text.delta') {
            const rd = payload.delta;
            if (typeof rd !== 'string' || rd.length === 0) continue;

            yield { delta: '', reasoningDelta: rd };
            continue;
          }

          // Reasoning summary channel (some servers emit this instead/as well). :contentReference[oaicite:4]{index=4}
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
    } finally {
      this.controllers.delete(runId);
    }
  }
}
