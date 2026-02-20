import { WorkflowConditionNodeExecutorService } from './workflow-condition-node-executor.service';

type AsyncGenItem = { delta?: string };

async function* genFromText(text: string): AsyncGenerator<AsyncGenItem, void, unknown> {
  yield { delta: text };
}

describe('WorkflowConditionNodeExecutorService', () => {
  it('enforces structured boolean output, persists runs, creates artifact, and writes ctx.nodes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'art1' }),
    } as any;

    const settings = {
      resolveProfile: jest.fn().mockResolvedValue({
        systemPrompt: 'SYS',
        params: { modelKey: 'm1', toolsEnabled: true },
      }),
    } as any;

    const engine = {
      streamChat: jest.fn().mockReturnValue(genFromText('{"result": true}')),
    } as any;

    const svc = new WorkflowConditionNodeExecutorService(workflows, settings, engine);

    const ctx: any = { nodes: {}, input: { x: 1 }, loop: { last: 'prev' } };

    await svc.execute({
      runId: 'r1',
      nodeId: 'n1',
      iteration: 0,
      node: {
        id: 'n1',
        type: 'workflow.condition',
        profileName: 'p1',
        prompt: 'Check {{input.x}}',
      },
      nodeById: new Map(),
      incoming: new Map(),
      ctx,
    } as any);

    expect(settings.resolveProfile).toHaveBeenCalledWith('default', 'p1');

    // running + completed
    expect(workflows.upsertNodeRun).toHaveBeenCalledTimes(2);
    expect(workflows.createArtifact).toHaveBeenCalledWith('r1', null, {
      kind: 'json',
      mimeType: 'application/json',
      contentJson: { result: true },
    });

    expect(ctx.nodes.n1).toBe(true);

    // params enforcement
    expect(engine.streamChat).toHaveBeenCalledTimes(1);
    const [, , params] = engine.streamChat.mock.calls[0];
    expect(params.toolsEnabled).toBe(false);
    expect(params.structuredOutput?.enabled).toBe(true);

    jest.useRealTimers();
  });

  it('throws when result field missing or non-boolean', async () => {
    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'art1' }),
    } as any;

    const settings = {
      resolveProfile: jest.fn().mockResolvedValue({ systemPrompt: '', params: { modelKey: 'm1' } }),
    } as any;

    const engine = {
      streamChat: jest.fn().mockReturnValue(genFromText('{"nope": 1}')),
    } as any;

    const svc = new WorkflowConditionNodeExecutorService(workflows, settings, engine);

    await expect(
      svc.execute({
        runId: 'r1',
        nodeId: 'n1',
        iteration: 0,
        node: { id: 'n1', type: 'workflow.condition', profileName: 'p1', prompt: 'x' },
        nodeById: new Map(),
        incoming: new Map(),
        ctx: { nodes: {}, input: null, loop: null },
      } as any),
    ).rejects.toThrow(/result/);
  });
});
