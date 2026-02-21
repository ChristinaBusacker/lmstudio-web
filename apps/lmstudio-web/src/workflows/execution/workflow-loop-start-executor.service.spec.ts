import { WorkflowLoopStartExecutorService } from './workflow-loop-start-executor.service';
import { COND_TRUE_PORT, LOOP_START } from '../worker/workflow-worker.constants';

describe('WorkflowLoopStartExecutorService', () => {
  it('executes count-mode loops, joins outputs, creates artifact, and writes ctx nodes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'art1' }),
    } as any;

    const settings = {
      resolveProfile: jest.fn().mockResolvedValue({ systemPrompt: '', params: { modelKey: 'm1' } }),
    } as any;

    const engine = {
      streamChat: jest.fn(),
    } as any;

    const dispatcher = {
      executeNodeInternal: jest.fn().mockImplementation(async ({ nodeId, iteration, ctx }: any) => {
        ctx.nodes[nodeId] = `out-${iteration}`;
      }),
    } as any;

    const svc = new WorkflowLoopStartExecutorService(workflows, settings, engine, dispatcher);

    const nodeById = new Map<string, any>([
      [
        'loop',
        {
          id: 'loop',
          type: 'workflow.loopStart',
          profileName: 'p1',
          config: { loop: { mode: 'count', count: 2, joiner: '|' } },
        },
      ],
      ['body', { id: 'body', type: 'lmstudio.llm' }],
      ['end', { id: 'end', type: 'workflow.loopEnd' }],
    ]);

    const incoming = new Map<string, any[]>();

    const ctx: any = { nodes: {}, input: null, loop: null };

    await svc.execute({
      runId: 'r1',
      nodeId: 'loop',
      node: nodeById.get('loop'),
      nodeById,
      incoming,
      ctx,
      loopRange: { startId: 'loop', endId: 'end', body: ['body'] },
    } as any);

    // count-mode should not call LLM
    expect(engine.streamChat).not.toHaveBeenCalled();

    // dispatcher called for each iteration
    expect(dispatcher.executeNodeInternal).toHaveBeenCalledTimes(1);

    // artifact created from joined text
    expect(workflows.createArtifact).toHaveBeenCalledTimes(1);
    const [runId, chatId, payload] = (workflows.createArtifact as jest.Mock).mock.calls[0];
    expect(runId).toBe('r1');
    expect(chatId).toBe(null);
    expect(payload).toEqual(
      expect.objectContaining({
        kind: 'text',
        mimeType: 'text/plain',
        contentText: expect.any(String),
      }),
    );
    expect((payload as any).contentText).toContain('out-0');

    // loopEnd gets same output
    expect(ctx.nodes.loop).toEqual({ items: ['out-0'], joined: 'out-0' });
    expect(ctx.nodes.end).toEqual({ items: ['out-0'], joined: 'out-0' });

    // running + completed (loop) + completed (end)
    expect(workflows.upsertNodeRun).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('skips when incoming condition edges exist but none are active', async () => {
    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn(),
    } as any;

    const settings = {
      resolveProfile: jest.fn(),
    } as any;

    const engine = { streamChat: jest.fn() } as any;
    const dispatcher = { executeNodeInternal: jest.fn() } as any;

    const svc = new WorkflowLoopStartExecutorService(workflows, settings, engine, dispatcher);

    const nodeById = new Map<string, any>([
      ['cond', { id: 'cond', type: 'workflow.condition' }],
      [
        'loop',
        {
          id: 'loop',
          type: 'workflow.loopStart',
          profileName: 'p1',
          config: { loop: { mode: 'count', count: 1 } },
        },
      ],
      ['end', { id: 'end', type: 'workflow.loopEnd' }],
    ]);

    const incoming = new Map<string, any[]>([
      [
        'loop',
        [
          {
            id: 'cond->loop',
            source: 'cond',
            target: 'loop',
            sourcePort: COND_TRUE_PORT,
            targetPort: 'port-left',
          },
        ],
      ],
    ]);

    const ctx: any = { nodes: { cond: false }, input: null, loop: null };

    await svc.execute({
      runId: 'r1',
      nodeId: 'loop',
      node: nodeById.get('loop'),
      nodeById,
      incoming,
      ctx,
      loopRange: { startId: 'loop', endId: 'end', body: [] },
    } as any);

    expect(workflows.upsertNodeRun).toHaveBeenCalledTimes(2);
    expect(ctx.nodes.loop).toBe('');
    expect(ctx.nodes.end).toBe('');
    expect(engine.streamChat).not.toHaveBeenCalled();
  });

  it('throws on nested loops in the body', async () => {
    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'art1' }),
    } as any;

    const settings = {
      resolveProfile: jest.fn().mockResolvedValue({ systemPrompt: '', params: { modelKey: 'm1' } }),
    } as any;

    const engine = { streamChat: jest.fn() } as any;
    const dispatcher = { executeNodeInternal: jest.fn() } as any;

    const svc = new WorkflowLoopStartExecutorService(workflows, settings, engine, dispatcher);

    const nodeById = new Map<string, any>([
      [
        'loop',
        {
          id: 'loop',
          type: 'workflow.loopStart',
          profileName: 'p1',
          config: { loop: { mode: 'count', count: 1 } },
        },
      ],
      ['nested', { id: 'nested', type: LOOP_START }],
      ['end', { id: 'end', type: 'workflow.loopEnd' }],
    ]);

    await expect(
      svc.execute({
        runId: 'r1',
        nodeId: 'loop',
        node: nodeById.get('loop'),
        nodeById,
        incoming: new Map(),
        ctx: { nodes: {}, input: null, loop: null },
        loopRange: { startId: 'loop', endId: 'end', body: ['nested'] },
      } as any),
    ).rejects.toThrow(/Nested loops/);
  });
});
