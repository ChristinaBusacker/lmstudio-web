import { WorkflowToolNodeExecutorService } from './workflow-tool-node-executor.service';

describe('WorkflowToolNodeExecutorService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('throws when config.tool.name is missing', async () => {
    const svc = new WorkflowToolNodeExecutorService({} as any, {} as any);
    await expect(
      svc.execute({
        runId: 'r1',
        nodeId: 'n1',
        node: { id: 'n1', type: 'workflow.tool', config: { tool: { name: '' } } },
        ctx: { nodes: {}, input: null },
        iteration: 0,
      } as any),
    ).rejects.toThrow(/missing config\.tool\.name/i);
  });

  it('renders templates in args, calls tool orchestrator, and creates artifact when orchestrator has none', async () => {
    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn().mockResolvedValue({ id: 'a1' }),
    } as any;

    const toolOrchestrator = {
      executeToolDirect: jest.fn().mockResolvedValue({
        result: { ok: true, value: 123 },
        artifactId: null,
      }),
    } as any;

    const svc = new WorkflowToolNodeExecutorService(workflows, toolOrchestrator);

    const ctx: any = {
      nodes: { x: { y: 'hi' } },
      input: { name: 'Alice' },
    };

    const node = {
      id: 't1',
      type: 'workflow.tool',
      config: {
        tool: {
          name: 'web_search',
          args: {
            q: 'Hello {{input.name}}',
            nested: ['{{nodes.x.y}}'],
          },
        },
      },
    } as any;

    await svc.execute({ runId: 'r1', nodeId: 't1', node, ctx, iteration: 2 } as any);

    expect(toolOrchestrator.executeToolDirect).toHaveBeenCalledWith({
      runId: 'r1',
      toolName: 'web_search',
      toolArgs: { q: 'Hello Alice', nested: ['hi'] },
    });

    // running + completed
    expect(workflows.upsertNodeRun).toHaveBeenCalledTimes(2);
    expect(workflows.createArtifact).toHaveBeenCalledWith('r1', null, {
      kind: 'json',
      mimeType: 'application/json',
      contentJson: { ok: true, value: 123 },
    });

    expect(ctx.nodes.t1).toEqual({ ok: true, value: 123 });
  });

  it('uses orchestrator-provided artifactId and stores string results as text output', async () => {
    const workflows = {
      upsertNodeRun: jest.fn().mockResolvedValue(undefined),
      createArtifact: jest.fn(),
    } as any;

    const toolOrchestrator = {
      executeToolDirect: jest.fn().mockResolvedValue({ result: 'hello', artifactId: 'art-x' }),
    } as any;

    const svc = new WorkflowToolNodeExecutorService(workflows, toolOrchestrator);

    const ctx: any = { nodes: {}, input: null };
    const node = {
      id: 't1',
      type: 'workflow.tool',
      config: { tool: { name: 'web_read', args: { url: 'https://example.com' } } },
    } as any;

    await svc.execute({ runId: 'r1', nodeId: 't1', node, ctx, iteration: 0 } as any);

    expect(workflows.createArtifact).not.toHaveBeenCalled();

    const completed = (workflows.upsertNodeRun as jest.Mock).mock.calls[1][2];
    expect(completed.status).toBe('completed');
    expect(completed.outputText).toBe('hello');
    expect(completed.primaryArtifactId).toBe('art-x');

    expect(ctx.nodes.t1).toBe('hello');
  });
});
