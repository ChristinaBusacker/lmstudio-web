import { WorkflowWorkerService } from './workflow-worker.service';
import type { WorkflowsService } from './workflows.service';
import type { WorkflowNodeExecutorService } from './execution/workflow-node-executor.service';
import { LOOP_START } from './worker/workflow-worker.constants';
import type { WorkflowGraph } from './engine/graph-types';

import { WorkflowEntity } from './entities/workflow.entity';
import { WorkflowRunEntity, type WorkflowRunStatus } from './entities/workflow-run.entity';
import { WorkflowNodeRunEntity } from './entities/workflow-node-run.entity';
import { ArtifactEntity } from './entities/artifact.entity';

type PrivateApi = {
  tick: () => Promise<void>;
};

function asPrivateApi(svc: WorkflowWorkerService): PrivateApi {
  return svc as unknown as PrivateApi;
}

type WorkflowsMock = Pick<
  WorkflowsService,
  | 'claimNextQueued'
  | 'get'
  | 'getRunStatus'
  | 'getRun'
  | 'setCurrentNode'
  | 'markRunCompleted'
  | 'markRunFailed'
>;

type ExecutorMock = Pick<WorkflowNodeExecutorService, 'executeNodeTopLevel' | 'executeLoopStart'>;

type ExecuteTopLevelArgs = Parameters<WorkflowNodeExecutorService['executeNodeTopLevel']>[0];
type ExecuteLoopStartArgs = Parameters<WorkflowNodeExecutorService['executeLoopStart']>[0];

type RunBundle = {
  run: WorkflowRunEntity;
  nodeRuns: WorkflowNodeRunEntity[];
  artifacts: ArtifactEntity[];
};

function makeWorkflowEntity(id: string, graph: WorkflowGraph): WorkflowEntity {
  // WorkflowEntity.graph is NodeDiagramModel; graph here is compatible shape.
  return {
    id,
    ownerKey: 'default',
    name: `wf-${id}`,
    description: null,
    graph: graph as unknown as WorkflowEntity['graph'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeRunEntity(
  id: string,
  workflowId: string,
  status: WorkflowRunStatus,
): WorkflowRunEntity {
  return {
    id,
    workflowId,
    ownerKey: 'default',
    status,
    currentNodeId: null,
    label: null,
    stats: null,
    error: null,
    lockedBy: null,
    lockedAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeRunBundle(run: WorkflowRunEntity): RunBundle {
  return { run, nodeRuns: [], artifacts: [] };
}

function makeWorkflowsMock(
  overrides?: Partial<jest.Mocked<WorkflowsMock>>,
): jest.Mocked<WorkflowsMock> {
  const base: jest.Mocked<WorkflowsMock> = {
    claimNextQueued: jest.fn<Promise<WorkflowRunEntity | null>, [string, string]>(),
    get: jest.fn<Promise<WorkflowEntity>, [string, string]>(),
    getRunStatus: jest.fn<Promise<WorkflowRunStatus | null>, [string, string]>(),
    getRun: jest.fn<Promise<RunBundle>, [string, string]>(),
    setCurrentNode: jest.fn<Promise<void>, [string, string | null]>(),
    markRunCompleted: jest.fn<Promise<void>, [string]>(),
    markRunFailed: jest.fn<Promise<void>, [string, string]>(),
  };

  return { ...base, ...(overrides ?? {}) };
}

function makeExecutorMock(
  overrides?: Partial<jest.Mocked<ExecutorMock>>,
): jest.Mocked<ExecutorMock> {
  const base: jest.Mocked<ExecutorMock> = {
    executeNodeTopLevel: jest.fn<Promise<void>, [ExecuteTopLevelArgs]>(),
    executeLoopStart: jest.fn<Promise<void>, [ExecuteLoopStartArgs]>(),
  };
  return { ...base, ...(overrides ?? {}) };
}

describe('WorkflowWorkerService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('claims the next queued workflow run and executes nodes to completion', async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'lmstudio.llm', prompt: 'hi' },
        { id: 'b', type: 'lmstudio.llm', prompt: 'there' },
      ],
      edges: [],
    };

    const wf = makeWorkflowEntity('w1', graph);
    const runClaimed = makeRunEntity('r1', 'w1', 'running');

    const workflows = makeWorkflowsMock({
      claimNextQueued: jest.fn<Promise<WorkflowRunEntity | null>, [string, string]>(
        async () => runClaimed,
      ),
      get: jest.fn<Promise<WorkflowEntity>, [string, string]>(async () => wf),
      getRunStatus: jest.fn<Promise<WorkflowRunStatus | null>, [string, string]>(
        async () => 'running',
      ),
      getRun: jest.fn<Promise<RunBundle>, [string, string]>(async () => makeRunBundle(runClaimed)),
      setCurrentNode: jest.fn<Promise<void>, [string, string | null]>(async () => undefined),
      markRunCompleted: jest.fn<Promise<void>, [string]>(async () => undefined),
      markRunFailed: jest.fn<Promise<void>, [string, string]>(async () => undefined),
    });

    const executor = makeExecutorMock({
      executeNodeTopLevel: jest.fn<Promise<void>, [ExecuteTopLevelArgs]>(async () => undefined),
      executeLoopStart: jest.fn<Promise<void>, [ExecuteLoopStartArgs]>(async () => undefined),
    });

    const svc = new WorkflowWorkerService(
      workflows as unknown as WorkflowsService,
      executor as unknown as WorkflowNodeExecutorService,
    );

    await asPrivateApi(svc).tick();

    expect(workflows.claimNextQueued).toHaveBeenCalledWith('default', 'workflow-worker-1');
    expect(executor.executeNodeTopLevel).toHaveBeenCalledTimes(2);
    expect(workflows.setCurrentNode).toHaveBeenCalledTimes(2);
    expect(workflows.markRunCompleted).toHaveBeenCalledWith('r1');
    expect(workflows.markRunFailed).not.toHaveBeenCalled();
  });

  it('stops execution when run status is paused (no executor calls)', async () => {
    const graph: WorkflowGraph = {
      nodes: [{ id: 'a', type: 'lmstudio.llm', prompt: 'hi' }],
      edges: [],
    };

    const wf = makeWorkflowEntity('w1', graph);
    const runClaimed = makeRunEntity('r1', 'w1', 'running');

    const workflows = makeWorkflowsMock({
      claimNextQueued: jest.fn<Promise<WorkflowRunEntity | null>, [string, string]>(
        async () => runClaimed,
      ),
      get: jest.fn<Promise<WorkflowEntity>, [string, string]>(async () => wf),
      getRunStatus: jest.fn<Promise<WorkflowRunStatus | null>, [string, string]>(
        async () => 'paused',
      ),
      getRun: jest.fn<Promise<RunBundle>, [string, string]>(async () => makeRunBundle(runClaimed)),
    });

    const executor = makeExecutorMock();

    const svc = new WorkflowWorkerService(
      workflows as unknown as WorkflowsService,
      executor as unknown as WorkflowNodeExecutorService,
    );

    await asPrivateApi(svc).tick();

    expect(executor.executeNodeTopLevel).not.toHaveBeenCalled();
    expect(executor.executeLoopStart).not.toHaveBeenCalled();
    expect(workflows.setCurrentNode).not.toHaveBeenCalled();
    expect(workflows.markRunCompleted).not.toHaveBeenCalled();
    expect(workflows.markRunFailed).not.toHaveBeenCalled();
  });

  it('marks run failed when a loop start has no matching loop end', async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: LOOP_START },
        { id: 'b', type: 'lmstudio.llm', prompt: 'inside' },
      ],
      edges: [],
    };

    const wf = makeWorkflowEntity('w1', graph);
    const runClaimed = makeRunEntity('r1', 'w1', 'running');

    const workflows = makeWorkflowsMock({
      claimNextQueued: jest.fn<Promise<WorkflowRunEntity | null>, [string, string]>(
        async () => runClaimed,
      ),
      get: jest.fn<Promise<WorkflowEntity>, [string, string]>(async () => wf),
      getRunStatus: jest.fn<Promise<WorkflowRunStatus | null>, [string, string]>(
        async () => 'running',
      ),
      getRun: jest.fn<Promise<RunBundle>, [string, string]>(async () => makeRunBundle(runClaimed)),
      markRunFailed: jest.fn<Promise<void>, [string, string]>(async () => undefined),
    });

    const executor = makeExecutorMock();

    const svc = new WorkflowWorkerService(
      workflows as unknown as WorkflowsService,
      executor as unknown as WorkflowNodeExecutorService,
    );

    await asPrivateApi(svc).tick();

    expect(workflows.markRunFailed).toHaveBeenCalledTimes(1);
    expect(workflows.markRunFailed).toHaveBeenCalledWith('r1', expect.stringContaining('LoopEnd'));
    expect(workflows.markRunCompleted).not.toHaveBeenCalled();
  });
});
