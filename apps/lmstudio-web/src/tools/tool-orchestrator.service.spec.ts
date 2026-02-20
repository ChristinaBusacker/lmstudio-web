import { ToolOrchestratorService } from './tool-orchestrator.service';

function makeStreamResponse(lines: string[]) {
  const payload = lines.join('\n');
  const chunks = [Buffer.from(payload, 'utf8')];

  const reader = {
    read: jest
      .fn()
      .mockImplementationOnce(async () => ({ value: chunks[0], done: false }))
      .mockImplementationOnce(async () => ({ value: undefined, done: true })),
  };

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => payload,
    body: {
      getReader: () => reader,
    },
    __reader: reader,
  } as any;
}

describe('ToolOrchestratorService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('extracts tool calls from plain text and normalizes args (browser.search/topn -> web_search/limit)', () => {
    const config = { get: jest.fn().mockReturnValue('http://lm:1234') } as any;
    const sse = { publishEphemeral: jest.fn() } as any;

    const svc = new ToolOrchestratorService(
      config,
      sse,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const res = (svc as any).extractToolCallsFromText(
      'Intro\n<|channel|>commentary to=browser.search code<|message|>{"query":"cats","topn":7}\nOutro',
    );

    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls[0].function.name).toBe('web_search');
    expect(JSON.parse(res.toolCalls[0].function.arguments)).toEqual({ q: 'cats', limit: 7 });
    expect(res.cleanedContent).toContain('Intro');
    expect(res.cleanedContent).toContain('Outro');
  });

  it('execTool parses noisy/encoded args, routes to web_search and emits SSE tool_call/result', async () => {
    const config = { get: jest.fn().mockReturnValue('http://lm:1234') } as any;
    const sse = { publishEphemeral: jest.fn() } as any;

    const webSearch = {
      search: jest.fn().mockResolvedValue({ ok: true, q: 'x', results: [], artifactId: 'a1' }),
    } as any;

    const svc = new ToolOrchestratorService(
      config,
      sse,
      webSearch,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const call = {
      id: 'c1',
      type: 'function',
      function: {
        name: 'web_search',
        // noisy string that contains a urlencoded JSON object
        arguments: 'blah {"q":"hello","limit":3} trailing',
      },
    } as any;

    const out = await (svc as any).execTool('r1', call);

    expect(out.result).toEqual(expect.objectContaining({ ok: true, q: 'x' }));
    expect(out.artifactId).toBe('a1');

    // tool_call
    expect(sse.publishEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'run.tool_call',
        runId: 'r1',
        payload: expect.objectContaining({ toolCallId: 'c1', toolName: 'web_search' }),
      }),
    );

    // web_search executed with parsed args
    expect(webSearch.search).toHaveBeenCalledWith({ q: 'hello', limit: 3, runId: 'r1' });
  });

  it('streamWithTools executes tool_calls and continues to final answer, emitting deltas and tool events', async () => {
    const config = { get: jest.fn().mockReturnValue('http://lm:1234') } as any;
    const sse = { publishEphemeral: jest.fn() } as any;

    const webRead = {
      read: jest.fn().mockResolvedValue({ url: 'u', text: 'T', meta: {}, artifactId: 'ar1' }),
    } as any;

    const svc = new ToolOrchestratorService(
      config,
      sse,
      {} as any,
      webRead,
      {} as any,
      { currentTime: jest.fn(), resolveRelativeDate: jest.fn(), dateMath: jest.fn() } as any,
      { evaluate: jest.fn() } as any,
      { validate: jest.fn(), repair: jest.fn() } as any,
    );

    const firstRound = makeStreamResponse([
      // tool call in structured delta
      'data: ' +
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'tc1',
                    function: { name: 'web_read', arguments: '{"url":"https://example.com"}' },
                  },
                ],
              },
            },
          ],
        }),
      'data: [DONE]',
    ]);

    const secondRound = makeStreamResponse([
      'data: ' +
        JSON.stringify({
          choices: [{ delta: { content: 'Final answer.' } }],
          usage: { prompt_tokens: 1, completion_tokens: 2 },
        }),
      'data: [DONE]',
    ]);

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(firstRound)
      .mockResolvedValueOnce(secondRound);

    global.fetch = fetchMock;

    const gen = svc.streamWithTools('r1', [{ role: 'user', content: 'hi' } as any], {
      modelKey: 'm1',
      temperature: 0,
      maxTokens: 10,
      topP: 1,
    } as any);

    const deltas: string[] = [];
    while (true) {
      const n = await gen.next();
      if (n.done) {
        expect(n.value.content).toContain('Final answer.');
        break;
      }
      if (n.value?.delta) deltas.push(n.value.delta);
    }

    expect(deltas.join('')).toBe('Final answer.');

    // tool executed
    expect(webRead.read).toHaveBeenCalledWith({ url: 'https://example.com', runId: 'r1' });

    // SSE events include tool_call + tool_result
    const types = (sse.publishEphemeral as jest.Mock).mock.calls.map((c) => c[0].type);
    expect(types).toContain('run.tool_call');
    expect(types).toContain('run.tool_result');

    // two HTTP rounds
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
