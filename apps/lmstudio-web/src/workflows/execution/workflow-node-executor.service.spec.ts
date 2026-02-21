import { WorkflowNodeExecutorService } from './workflow-node-executor.service';
import { COND_TRUE_PORT } from '../worker/workflow-worker.constants';

function mkSvc(overrides?: Partial<any>) {
  const workflows = {
    getRun: jest.fn().mockResolvedValue({ nodeRuns: [] }),
    setCurrentNode: jest.fn().mockResolvedValue(undefined),
    upsertNodeRun: jest.fn().mockResolvedValue(undefined),
    createArtifact: jest.fn().mockResolvedValue({ id: 'a1' }),
  } as any;

  const settings = {} as any;
  const engine = {} as any;
  const toolOrchestrator = {
    executeToolDirect: jest.fn().mockResolvedValue({ result: { ok: true }, artifactId: 'docA' }),
  } as any;

  const assets = {
    getById: jest.fn().mockResolvedValue({
      id: 'asset1',
      originalFilename: 'f.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      sha256: 'h',
    }),
  } as any;

  const assetExtract = {
    extractByAssetId: jest.fn().mockResolvedValue({
      kind: 'pdf',
      text: 'EXTRACTED',
      json: null,
      warnings: [],
      stats: { pages: 1 },
    }),
  } as any;

  const llmExec = { type: 'lmstudio.llm', execute: jest.fn() } as any;
  const toolExec = { type: 'lmstudio.tool', execute: jest.fn() } as any;
  const condExec = { type: 'workflow.condition', execute: jest.fn() } as any;
  const loopExec = { type: 'workflow.loopStart', execute: jest.fn() } as any;

  const svc = new WorkflowNodeExecutorService(
    workflows,
    settings,
    engine,
    toolOrchestrator,
    assets,
    assetExtract,
    llmExec,
    toolExec,
    condExec,
    loopExec,
  );

  return {
    svc,
    deps: {
      workflows,
      toolOrchestrator,
      assets,
      assetExtract,
      llmExec,
      toolExec,
      condExec,
      loopExec,
    },
    ...(overrides ?? {}),
  };
}

describe('WorkflowNodeExecutorService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('skips execution when incoming condition edges exist but none are active', async () => {
    const { svc, deps } = mkSvc();

    const nodeById = new Map<string, any>([
      ['cond', { id: 'cond', type: 'workflow.condition' }],
      ['n1', { id: 'n1', type: 'lmstudio.llm', prompt: 'x', profileName: 'p1' }],
    ]);

    const incoming = new Map<string, any[]>([
      [
        'n1',
        [
          {
            id: 'e1',
            source: 'cond',
            target: 'n1',
            sourcePort: COND_TRUE_PORT,
            targetPort: 'port-left',
          },
        ],
      ],
    ]);

    const ctx: any = { nodes: { cond: false }, input: null };

    await svc.executeNodeTopLevel({
      runId: 'r1',
      nodeId: 'n1',
      node: nodeById.get('n1'),
      nodeById,
      incoming,
      ctx,
    });

    expect(deps.llmExec.execute).not.toHaveBeenCalled();
    expect(ctx.nodes.n1).toBe('');
    expect(deps.workflows.upsertNodeRun).toHaveBeenCalledWith(
      'r1',
      'n1',
      expect.objectContaining({ status: 'completed', outputText: '' }),
    );
  });

  it('builds ctx.input from upstream right->left data edges and dispatches to registered executor', async () => {
    const { svc, deps } = mkSvc();

    const nodeById = new Map<string, any>([
      ['a', { id: 'a', type: 'lmstudio.llm' }],
      ['b', { id: 'b', type: 'lmstudio.llm' }],
      ['n1', { id: 'n1', type: 'lmstudio.llm', prompt: 'x', profileName: 'p1' }],
    ]);

    const incoming = new Map<string, any[]>([
      [
        'n1',
        [
          {
            id: 'e1',
            source: 'b',
            target: 'n1',
            sourcePort: 'port-right',
            targetPort: 'port-left',
          },
          {
            id: 'e2',
            source: 'a',
            target: 'n1',
            sourcePort: 'port-right',
            targetPort: 'port-left',
          },
        ],
      ],
    ]);

    const ctx: any = { nodes: { a: 'A', b: 'B' }, input: null };

    await svc.executeNodeTopLevel({
      runId: 'r1',
      nodeId: 'n1',
      node: nodeById.get('n1'),
      nodeById,
      incoming,
      ctx,
    });

    // sorted by node id (a then b)
    expect(ctx.input).toContain('Input from a');
    expect(ctx.input).toContain('A');
    expect(ctx.input).toContain('Input from b');
    expect(ctx.input).toContain('B');

    expect(deps.llmExec.execute).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'r1', nodeId: 'n1', iteration: 0, ctx }),
    );
  });

  it('workflow.merge orders by targetPort index and merges text', async () => {
    const { svc, deps } = mkSvc();

    const nodeById = new Map<string, any>([
      ['a', { id: 'a', type: 'lmstudio.llm' }],
      ['b', { id: 'b', type: 'lmstudio.llm' }],
      ['m', { id: 'm', type: 'workflow.merge', config: { merge: { separator: '|' } } }],
    ]);

    const incoming = new Map<string, any[]>([
      [
        'm',
        [
          { id: 'e2', source: 'b', target: 'm', targetPort: 'in-1' },
          { id: 'e1', source: 'a', target: 'm', targetPort: 'in-0' },
        ],
      ],
    ]);

    const ctx: any = { nodes: { a: 'AAA', b: 'BBB' }, input: null };

    await svc.executeNodeTopLevel({
      runId: 'r1',
      nodeId: 'm',
      node: nodeById.get('m'),
      nodeById,
      incoming,
      ctx,
    });

    expect(deps.workflows.createArtifact).toHaveBeenCalledWith('r1', null, {
      kind: 'text',
      mimeType: 'text/plain',
      contentText: 'AAA|BBB',
    });

    expect(ctx.nodes.m).toBe('AAA|BBB');
  });

  it('workflow.export requires exactly one input and creates a named artifact', async () => {
    const { svc, deps } = mkSvc();

    const nodeById = new Map<string, any>([
      ['a', { id: 'a', type: 'lmstudio.llm' }],
      ['b', { id: 'b', type: 'lmstudio.llm' }],
      ['x', { id: 'x', type: 'workflow.export', config: { export: { filename: 'x.txt' } } }],
    ]);

    const incoming = new Map<string, any[]>([
      [
        'x',
        [
          { id: 'e1', source: 'a', target: 'x', sourcePort: 'port-right', targetPort: 'port-left' },
          { id: 'e2', source: 'b', target: 'x', sourcePort: 'port-right', targetPort: 'port-left' },
        ],
      ],
    ]);

    const ctx: any = { nodes: { a: 'A', b: 'B' }, input: null };

    await expect(
      svc.executeNodeTopLevel({
        runId: 'r1',
        nodeId: 'x',
        node: nodeById.get('x'),
        nodeById,
        incoming,
        ctx,
      }),
    ).rejects.toThrow(/exactly 1 input/i);

    // now only one input
    incoming.set('x', [incoming.get('x')![0]]);

    await svc.executeNodeTopLevel({
      runId: 'r1',
      nodeId: 'x',
      node: nodeById.get('x'),
      nodeById,
      incoming,
      ctx,
    });

    expect(deps.workflows.createArtifact).toHaveBeenCalledWith(
      'r1',
      null,
      expect.objectContaining({ filename: 'x.txt', contentText: 'A' }),
    );
    expect(ctx.nodes.x).toBe('A');
  });

  it('workflow.asset reads document via tool orchestrator and optionally extracts text', async () => {
    const { svc, deps } = mkSvc();

    const nodeById = new Map<string, any>([
      [
        'assetNode',
        {
          id: 'assetNode',
          type: 'workflow.asset',
          config: { asset: { assetId: 'asset1', extract: true } },
        },
      ],
    ]);

    const incoming = new Map<string, any[]>();
    const ctx: any = { nodes: {}, input: null };

    await svc.executeNodeTopLevel({
      runId: 'r1',
      nodeId: 'assetNode',
      node: nodeById.get('assetNode'),
      nodeById,
      incoming,
      ctx,
    });

    expect(deps.toolOrchestrator.executeToolDirect).toHaveBeenCalledWith({
      runId: 'r1',
      toolName: 'doc_read',
      toolArgs: { assetId: 'asset1' },
    });

    expect(deps.assetExtract.extractByAssetId).toHaveBeenCalledWith('asset1');

    expect(ctx.nodes.assetNode).toEqual(
      expect.objectContaining({
        assetId: 'asset1',
        filename: 'f.pdf',
        extractedText: 'EXTRACTED',
        docReadArtifactId: 'docA',
      }),
    );

    // should store outputText as extractedText
    expect(deps.workflows.upsertNodeRun).toHaveBeenCalledWith(
      'r1',
      'assetNode',
      expect.objectContaining({ outputText: 'EXTRACTED' }),
    );
  });
});
