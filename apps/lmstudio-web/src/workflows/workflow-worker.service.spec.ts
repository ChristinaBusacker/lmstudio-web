import { WorkflowWorkerService } from './workflow-worker.service';
import type { WorkflowsService } from './workflows.service';
import type { WorkflowNodeExecutorService } from './execution/workflow-node-executor.service';
import { LOOP_START } from './worker/workflow-worker.constants';
import type { WorkflowGraph } from './engine/graph-types';

type PrivateApi = {
  tick: () => Promise<void>;
};

function asPrivateApi(svc: WorkflowWorkerService): PrivateApi {
  return svc as unknown as PrivateApi;
}

type QueuedRun = { id: string; workflowId: string };

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

function makeWorkflowsMock(
  overrides?: Partial<jest.Mocked<WorkflowsMock>>,
): jest.Mocked<WorkflowsMock> {
  const base: jest.Mocked<WorkflowsMock> = {
    claimNextQueued: jest.fn<Promise<QueuedRun | null>, [string, string]>(),
    get: jest.fn<Promise<unknown>, [string, string]>(),
    getRunStatus: jest.fn<Promise<unknown>, [string, string]>(),
    getRun: jest.fn<Promise<unknown>, [string, string]>(),
    setCurrentNode: jest.fn<Promise<void>, [string, string]>(),
    markRunCompleted: jest.fn<Promise<void>, [string]>(),
    markRunFailed: jest.fn<Promise<void>, [string, string]>(),
  };

  return { ...base, ...(overrides ?? {}) };
}

function makeExecutorMock(
  overrides?: Partial<jest.Mocked<ExecutorMock>>,
): jest.Mocked<ExecutorMock> {
  const base: jest.Mocked<ExecutorMock> = {
    executeNodeTopLevel: jest.fn<Promise<void>, [unknown]>(),
    executeLoopStart: jest.fn<Promise<void>, [unknown]>(),
  };
  return { ...base, ...(overrides ?? {}) };
}

describe('WorkflowWorkerService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
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

    const workflows = makeWorkflowsMock({
      claimNextQueued: jest.fn(async () => ({ id: 'r1', workflowId: 'w1' })),
      get: jest.fn(async () => ({ id: 'w1', graph })),
      getRunStatus: jest.fn(async () => 'running'),
      getRun: jest.fn(async () => ({ id: 'r1', nodeRuns: [] })),
    });

    const executor = makeExecutorMock();

    const svc = new WorkflowWorkerService(workflows, executor);
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

    const workflows = makeWorkflowsMock({
      claimNextQueued: jest.fn(async () => ({ id: 'r1', workflowId: 'w1' })),
      get: jest.fn(async () => ({ id: 'w1', graph })),
      getRunStatus: jest.fn(async () => 'paused'),
      getRun: jest.fn(async () => ({ id: 'r1', nodeRuns: [] })),
    });
    const executor = makeExecutorMock();

    const svc = new WorkflowWorkerService(workflows, executor);
    await asPrivateApi(svc).tick();

    expect(executor.executeNodeTopLevel).not.toHaveBeenCalled();
    expect(workflows.markRunCompleted).not.toHaveBeenCalled();
  });

  it('marks run failed when a loop start has no matching loop end', async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: LOOP_START },
        { id: 'b', type: 'lmstudio.llm', prompt: 'inside' },
      ],
      edges: [],
    };

    const workflows = makeWorkflowsMock({
      claimNextQueued: jest.fn(async () => ({ id: 'r1', workflowId: 'w1' })),
      get: jest.fn(async () => ({ id: 'w1', graph })),
      getRunStatus: jest.fn(async () => 'running'),
      getRun: jest.fn(async () => ({ id: 'r1', nodeRuns: [] })),
    });

    const executor = makeExecutorMock();

    const svc = new WorkflowWorkerService(workflows, executor);
    await asPrivateApi(svc).tick();

    expect(workflows.markRunFailed).toHaveBeenCalledWith('r1', expect.stringContaining('LoopEnd'));
    expect(workflows.markRunCompleted).not.toHaveBeenCalled();
  });
});
