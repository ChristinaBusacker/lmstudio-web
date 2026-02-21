import { WorkflowLoopStartExecutorService } from './workflow-loop-start-executor.service';

// Minimal mocks: we only test loopStart passthrough behavior, not DB persistence or LLM calls.
describe('WorkflowLoopStartExecutorService', () => {
  it('should expose its upstream input as node output during body execution (passthrough)', async () => {
    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'artifact-1' }),
    } as any;

    const settings = {
      resolveProfile: jest.fn().mockResolvedValue({
        systemPrompt: '',
        params: { modelKey: 'dummy' },
      }),
    } as any;

    const engine = {
      // should never be called in mode=count
      streamChat: jest.fn(),
    } as any;

    const dispatcher = {
      executeNodeInternal: jest.fn(async ({ nodeId, ctx }: any) => {
        // This is the core assertion for the regression:
        // body nodes must be able to read the loopStart output as upstream.
        expect(ctx.nodes['LOOP']).toBe('UPSTREAM');

        // Simulate a body node producing output.
        ctx.nodes[nodeId] = `out:${ctx.loop?.iteration}`;
      }),
    } as any;

    const svc = new WorkflowLoopStartExecutorService(workflows, settings, engine, dispatcher);

    const nodeById = new Map<string, any>();
    nodeById.set('A', { id: 'A', type: 'lmstudio.llm' });
    nodeById.set('LOOP', {
      id: 'LOOP',
      type: 'workflow.loopStart',
      profileName: 'default',
      config: { loop: { mode: 'count', count: 2, maxIterations: 2, joiner: '\n' } },
    });
    nodeById.set('B', { id: 'B', type: 'lmstudio.tool' });
    nodeById.set('END', { id: 'END', type: 'workflow.loopEnd' });

    // Incoming edges for LOOP: A -> LOOP (data-flow)
    const incoming = new Map<string, any[]>();
    incoming.set('LOOP', [
      {
        source: 'A',
        target: 'LOOP',
        sourcePort: 'port-right',
        targetPort: 'port-left',
      },
    ]);

    const ctx: any = {
      nodes: {
        A: 'UPSTREAM',
      },
      input: null,
      loop: null,
    };

    await svc.execute({
      runId: 'run-1',
      nodeId: 'LOOP',
      node: nodeById.get('LOOP'),
      nodeById,
      incoming,
      ctx,
      iteration: 0,
      loopRange: {
        body: ['B'],
        endId: 'END',
      },
    });

    // Final output should still be the aggregated loop output object.
    expect(ctx.nodes.LOOP).toEqual({
      items: ['out:1', 'out:2'],
      joined: 'out:1\nout:2',
    });
    expect(ctx.nodes.END).toEqual(ctx.nodes.LOOP);
  });
});
