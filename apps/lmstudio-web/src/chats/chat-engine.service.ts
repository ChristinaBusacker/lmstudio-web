/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import type { LmMessage, RunParams, StreamDelta, RunStats } from '../common/types/llm.types';

interface StreamResult {
  content: string;
  stats?: RunStats;
}

@Injectable()
export class ChatEngineService {
  private readonly controllers = new Map<string, AbortController>();
  private readonly baseUrl = process.env.LMSTUDIO_BASE_URL ?? 'http://127.0.0.1:1234';

  cancel(runId: string) {
    this.controllers.get(runId)?.abort();
  }

  /**
   * Flattens structured chat messages into a single prompt string.
   * This is REQUIRED for LM Studio JIT / model autoload to work.
   */
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

    try {
      const res = await fetch(`${this.baseUrl}/v1/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: params.modelKey,
          input: this.flattenMessages(messages),
          temperature: params.temperature,
          max_output_tokens: params.maxTokens,
          top_p: params.topP,
          stream: true,
        }),
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
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          if (line === 'data: [DONE]') {
            return { content: full };
          }

          let payload: any;
          try {
            payload = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          // responses streaming format
          if (payload?.type === 'response.output_text.delta') {
            const delta = payload.delta;
            if (!delta) continue;

            full += delta;
            yield { delta };
          }
        }
      }

      return { content: full };
    } finally {
      this.controllers.delete(runId);
    }
  }
}
