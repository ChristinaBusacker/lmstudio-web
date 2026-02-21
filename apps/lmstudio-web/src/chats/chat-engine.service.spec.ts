import { ChatEngineService } from './chat-engine.service';
import type { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import type { LmMessage, RunParams, StreamDelta } from '../common/types/llm.types';

type FetchLike = typeof fetch;

function makeConfig(baseUrl: string): Pick<ConfigService, 'get'> {
  return {
    get: <T = string>(key: string, fallback?: T): T => {
      if (key === 'LMSTUDIO_BASE_URL') return baseUrl as unknown as T;
      return fallback as T;
    },
  };
}

function streamFromLines(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const chunks = lines.map((l) => enc.encode(l));
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

function makeOkStreamingResponse(lines: string[]): Response {
  return new Response(streamFromLines(lines), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

async function drain<T>(
  gen: AsyncGenerator<T, unknown, void>,
): Promise<{ items: T[]; ret: unknown }> {
  const items: T[] = [];

  while (true) {
    const r = await gen.next();
    if (r.done) return { items, ret: r.value };
    items.push(r.value);
  }
}

describe('ChatEngineService', () => {
  let fetchSpy: jest.SpyInstance<ReturnType<FetchLike>, Parameters<FetchLike>>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    fetchSpy = jest.spyOn(globalThis as unknown as { fetch: FetchLike }, 'fetch');
  });

  afterEach(() => {
    jest.useRealTimers();
    fetchSpy.mockRestore();
  });

  it('streams from /v1/responses when structured output is disabled and yields deltas', async () => {
    fetchSpy.mockResolvedValue(
      makeOkStreamingResponse([
        'data: {"type":"response.output_text.delta","delta":"Hel"}\n',
        'data: {"type":"response.reasoning_text.delta","delta":"R"}\n',
        'data: {"type":"response.output_text.delta","delta":"lo"}\n',
        'data: {"type":"response.completed","response":{"id":"x"}}\n',
        'data: [DONE]\n',
      ]),
    );

    const svc = new ChatEngineService(makeConfig('http://lm') as ConfigService);
    const messages: LmMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'yo' },
    ];
    const params: RunParams = {
      modelKey: 'any-model',
      temperature: 0.2,
      maxTokens: 10,
      topP: 1,
      structuredOutput: { enabled: false },
    } as unknown as RunParams;

    const gen = svc.streamChat('r1', messages, params);
    const { items, ret } = await drain<StreamDelta>(gen);

    expect(items).toEqual([{ delta: 'Hel' }, { delta: '', reasoningDelta: 'R' }, { delta: 'lo' }]);
    expect(ret).toEqual({
      content: 'Hello',
      stats: { response: { id: 'x' } },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('/v1/responses');
  });

  it('switches to /v1/chat/completions when structured output is enabled and parses OpenAI-style deltas', async () => {
    fetchSpy.mockResolvedValue(
      makeOkStreamingResponse([
        'data: {"choices":[{"delta":{"content":"{"}}]}\n',
        'data: {"choices":[{"delta":{"content":"\\"ok\\":true"}}]}\n',
        // NOTE: service currently prioritizes delta parsing and "continue"s, so usage on same chunk is ignored
        'data: {"choices":[{"delta":{"content":"}"}}],"usage":{"total_tokens":7}}\n',
        'data: [DONE]\n',
      ]),
    );

    const svc = new ChatEngineService(makeConfig('http://lm') as ConfigService);
    const messages: LmMessage[] = [{ role: 'user', content: 'return json' }];
    const params: RunParams = {
      modelKey: 'any-model',
      temperature: 0.2,
      maxTokens: 10,
      topP: 1,
      structuredOutput: {
        enabled: true,
        name: 'test_schema',
        schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        strict: true,
      },
    } as unknown as RunParams;

    const gen = svc.streamChat('r1', messages, params);
    const { items, ret } = await drain<StreamDelta>(gen);

    expect(items.map((i) => i.delta)).toEqual(['{', '"ok":true', '}']);
    expect(ret).toEqual({
      content: '{"ok":true}',
      stats: {},
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('/v1/chat/completions');
  });

  it('throws ServiceUnavailableException with LMSTUDIO_UNREACHABLE when fetch fails', async () => {
    fetchSpy.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const svc = new ChatEngineService(makeConfig('http://lm') as ConfigService);
    const messages: LmMessage[] = [{ role: 'user', content: 'hi' }];
    const params: RunParams = {
      modelKey: 'any-model',
      temperature: 0.2,
      maxTokens: 10,
      topP: 1,
      structuredOutput: { enabled: false },
    } as unknown as RunParams;

    const gen = svc.streamChat('r1', messages, params);
    try {
      await gen.next();
      throw new Error('expected generator to throw');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(ServiceUnavailableException);
      const ex = e as ServiceUnavailableException;
      expect(ex.getResponse()).toMatchObject({ code: 'LMSTUDIO_UNREACHABLE' });
    }
  });
});
