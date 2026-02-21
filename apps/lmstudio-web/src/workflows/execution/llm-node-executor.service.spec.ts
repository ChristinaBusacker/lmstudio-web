import { LlmNodeExecutorService } from './llm-node-executor.service';

function makeAsyncGen(deltas: string[]) {
  return {
    async next() {
      if (deltas.length === 0) return { value: undefined, done: true } as any;
      const d = deltas.shift()!;
      return { value: { delta: d }, done: false } as any;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  } as any;
}

describe('LlmNodeExecutorService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();

    delete process.env.WORKFLOW_MAX_PROMPT_BYTES;
    delete process.env.WORKFLOW_MAX_UPSTREAM_BYTES;
    delete process.env.WORKFLOW_MAX_LOOP_CONDITION_BYTES;
    delete process.env.WORKFLOW_MAX_LOOP_TOTAL_PRODUCED_BYTES;
  });

  it('throws when profileName or prompt is missing', async () => {
    const svc = new LlmNodeExecutorService({} as any, {} as any, {} as any);

    await expect(
      svc.execute({
        runId: 'r1',
        nodeId: 'n1',
        node: { id: 'n1', type: 'lmstudio.llm', profileName: '', prompt: 'x' } as any,
        ctx: { nodes: {}, input: null } as any,
        iteration: 0,
      } as any),
    ).rejects.toThrow(/missing profileName/i);

    await expect(
      svc.execute({
        runId: 'r1',
        nodeId: 'n1',
        node: { id: 'n1', type: 'lmstudio.llm', profileName: 'p', prompt: '' } as any,
        ctx: { nodes: {}, input: null } as any,
        iteration: 0,
      } as any),
    ).rejects.toThrow(/missing prompt/i);
  });

  it('writes text output when JSON parsing fails and structured output is disabled', async () => {
    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'a1' }),
    } as any;

    const settings = {
      resolveProfile: jest.fn().mockResolvedValue({ systemPrompt: '', params: { modelKey: 'm1' } }),
    } as any;

    const engine = {
      streamChat: jest.fn().mockReturnValue(makeAsyncGen(['Hello', ' world'])),
    } as any;

    const svc = new LlmNodeExecutorService(workflows, settings, engine);

    const ctx: any = { nodes: {}, input: { x: 1 }, __depsForRender: new Set() };

    await svc.execute({
      runId: 'r1',
      nodeId: 'n1',
      node: { id: 'n1', type: 'lmstudio.llm', profileName: 'p1', prompt: 'Say {{input.x}}' } as any,
      ctx,
      iteration: 0,
    } as any);

    expect(engine.streamChat).toHaveBeenCalled();
    expect(workflows.createArtifact).toHaveBeenCalledWith('r1', null, {
      kind: 'text',
      mimeType: 'text/plain',
      contentText: 'Hello world',
    });

    expect(ctx.nodes.n1).toBe('Hello world');

    // completed run stored
    expect(workflows.upsertNodeRun).toHaveBeenCalledWith(
      'r1',
      'n1',
      expect.objectContaining({
        status: 'completed',
        outputText: 'Hello world',
        primaryArtifactId: 'a1',
      }),
    );

    // tools are disabled for workflow LLM nodes
    const paramsPassed = (engine.streamChat as jest.Mock).mock.calls[0][2];
    expect(paramsPassed.toolsEnabled).toBe(false);
  });

  it('enforces structured output: throws on invalid JSON and writes JSON when valid', async () => {
    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'a1' }),
    } as any;

    const settings = {
      resolveProfile: jest.fn().mockResolvedValue({ systemPrompt: '', params: { modelKey: 'm1' } }),
    } as any;

    const engine = {
      streamChat: jest.fn(),
    } as any;

    const svc = new LlmNodeExecutorService(workflows, settings, engine);

    const ctx: any = { nodes: {}, input: null };

    engine.streamChat.mockReturnValueOnce(makeAsyncGen(['not-json']));

    await expect(
      svc.execute({
        runId: 'r1',
        nodeId: 'n1',
        node: {
          id: 'n1',
          type: 'lmstudio.llm',
          profileName: 'p1',
          prompt: 'x',
          config: { llm: { structuredOutput: { enabled: true, schema: { type: 'object' } } } },
        } as any,
        ctx,
        iteration: 0,
      } as any),
    ).rejects.toThrow(/valid JSON/i);

    engine.streamChat.mockReturnValueOnce(makeAsyncGen(['{"a":1}']));

    await svc.execute({
      runId: 'r1',
      nodeId: 'n2',
      node: {
        id: 'n2',
        type: 'lmstudio.llm',
        profileName: 'p1',
        prompt: 'x',
        config: { llm: { structuredOutput: { enabled: true, schema: { type: 'object' } } } },
      } as any,
      ctx,
      iteration: 0,
    } as any);

    expect(workflows.createArtifact).toHaveBeenCalledWith('r1', null, {
      kind: 'json',
      mimeType: 'application/json',
      contentJson: { a: 1 },
    });

    expect(ctx.nodes.n2).toEqual({ a: 1 });
  });

  it('automatically appends upstream input when prompt does not reference {{input}}', async () => {
    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'a1' }),
    } as any;

    // Simulate a TypeORM-style profile entity (class instance)
    class ProfileEntity {
      systemPrompt = '';
      params = { modelKey: 'm1' };
    }

    const settings = {
      resolveProfile: jest.fn().mockResolvedValue(new ProfileEntity()),
    } as any;

    const engine = {
      streamChat: jest.fn().mockReturnValue(makeAsyncGen(['OK'])),
    } as any;

    const svc = new LlmNodeExecutorService(workflows, settings, engine);

    const ctx: any = { nodes: {}, input: { hello: 'world' }, loop: null };

    await svc.execute({
      runId: 'r1',
      nodeId: 'n1',
      node: { id: 'n1', type: 'lmstudio.llm', profileName: 'GPT', prompt: 'Summarize.' } as any,
      ctx,
      iteration: 0,
    } as any);

    const call = (engine.streamChat as any).mock.calls[0];
    const messages = call[1];
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('Summarize.');
    expect(messages[0].content).toContain('UPSTREAM');
    expect(messages[0].content).toContain('"hello": "world"');
  });

  it('aborts early when prompt exceeds WORKFLOW_MAX_PROMPT_BYTES', async () => {
    process.env.WORKFLOW_MAX_PROMPT_BYTES = '50';

    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'a1' }),
    } as any;

    const settings = {
      resolveProfile: jest.fn().mockResolvedValue({ systemPrompt: '', params: { modelKey: 'm1' } }),
    } as any;

    const engine = {
      streamChat: jest.fn(),
    } as any;

    const svc = new LlmNodeExecutorService(workflows, settings, engine);

    const ctx: any = { nodes: {}, input: 'X'.repeat(1000) };

    await expect(
      svc.execute({
        runId: 'r1',
        nodeId: 'n1',
        node: { id: 'n1', type: 'lmstudio.llm', profileName: 'p1', prompt: 'Summarize.' } as any,
        ctx,
        iteration: 0,
      } as any),
    ).rejects.toThrow(/context budget exceeded/i);

    expect(engine.streamChat).not.toHaveBeenCalled();
  });
});
