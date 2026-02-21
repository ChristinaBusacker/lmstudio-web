import { BadRequestException } from '@nestjs/common';
import { createMockRepo } from '../../test/utils/mock-repo';
import { WorkflowsService } from './workflows.service';
import { WorkflowEntity } from './entities/workflow.entity';
import { WorkflowRunEntity } from './entities/workflow-run.entity';
import { WorkflowNodeRunEntity } from './entities/workflow-node-run.entity';
import { ArtifactEntity } from './entities/artifact.entity';

function extractInValues(op: any): unknown[] {
  if (!op) return [];
  if (Array.isArray(op)) return op;
  // TypeORM FindOperator shapes vary; cover common ones.
  return (op.value ?? op._value ?? op._values ?? []) as unknown[];
}

describe('WorkflowsService', () => {
  it('createRun publishes workflow.run.status', async () => {
    const workflows = createMockRepo<WorkflowEntity>({
      findOne: jest.fn(async () => ({ id: 'w1', ownerKey: 'o1' }) as any) as any,
    });

    const runs = createMockRepo<WorkflowRunEntity>({
      save: jest.fn(async (x: any) => ({ id: 'r1', ...x })) as any,
    });

    const nodeRuns = createMockRepo<WorkflowNodeRunEntity>();
    const artifacts = createMockRepo<ArtifactEntity>();
    const sse = { publish: jest.fn() } as any;

    const svc = new WorkflowsService(
      workflows as any,
      runs as any,
      nodeRuns as any,
      artifacts as any,
      sse,
    );
    const out = await svc.createRun('o1', 'w1', { label: 'Test' } as any);

    expect(out.id).toBe('r1');
    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'workflow.run.status',
        workflowId: 'w1',
        runId: 'r1',
        payload: expect.objectContaining({ status: 'queued' }),
      }),
    );
  });

  it('claimNextQueued transitions run to running and publishes status', async () => {
    const runs = createMockRepo<WorkflowRunEntity>({
      findOne: jest
        .fn()
        .mockResolvedValueOnce({ id: 'r1', ownerKey: 'o1', status: 'queued', workflowId: 'w1' })
        .mockResolvedValueOnce({ id: 'r1', ownerKey: 'o1', status: 'running', workflowId: 'w1' }),
    } as any);

    const svc = new WorkflowsService(
      createMockRepo<WorkflowEntity>() as any,
      runs as any,
      createMockRepo<WorkflowNodeRunEntity>() as any,
      createMockRepo<ArtifactEntity>() as any,
      { publish: jest.fn() } as any,
    );

    const out = await svc.claimNextQueued('o1', 'worker-1');
    expect(runs.update).toHaveBeenCalledWith(
      { id: 'r1' },
      expect.objectContaining({ status: 'running', lockedBy: 'worker-1' }),
    );
    expect(out?.status).toBe('running');
  });

  it('rerunFrom computes downstream via prompt refs + edge dependencies and deletes affected nodeRuns/artifacts', async () => {
    const workflows = createMockRepo<WorkflowEntity>({
      findOne: jest.fn(async () => ({
        id: 'w1',
        ownerKey: 'o1',
        graph: {
          nodes: [
            { id: 'A', type: 'lmstudio.llm', prompt: 'A' },
            { id: 'B', type: 'lmstudio.llm', prompt: 'use {{nodes.A.output}}' },
            { id: 'C', type: 'workflow.condition', prompt: 'if {{ input }}' },
            { id: 'D', type: 'lmstudio.llm', prompt: 'independent' },
          ],
          edges: [{ source: 'B', target: 'C' }],
        },
      })),
    } as any);

    const runs = createMockRepo<WorkflowRunEntity>({
      findOne: jest.fn(async (opts: any) => {
        // first call includes ownerKey
        if (opts?.where?.id === 'r1') return { id: 'r1', ownerKey: 'o1', workflowId: 'w1' };
        return { id: 'r1', ownerKey: 'o1', workflowId: 'w1', status: 'queued' };
      }) as any,
    } as any);

    const nodeRuns = createMockRepo<WorkflowNodeRunEntity>({
      find: jest.fn(async () => [
        { id: 'nrA', workflowRunId: 'r1', nodeId: 'A', iteration: 0 },
        { id: 'nrB', workflowRunId: 'r1', nodeId: 'B', iteration: 0 },
        { id: 'nrC', workflowRunId: 'r1', nodeId: 'C', iteration: 0 },
      ]) as any,
      delete: jest.fn(async () => undefined) as any,
    } as any);

    const artifacts = createMockRepo<ArtifactEntity>({
      delete: jest.fn(async () => undefined) as any,
    } as any);

    const sse = { publish: jest.fn() } as any;

    const svc = new WorkflowsService(
      workflows as any,
      runs as any,
      nodeRuns as any,
      artifacts as any,
      sse,
    );
    await svc.rerunFrom('o1', 'r1', 'A');

    // nodeRuns.find called with In([...downstream])
    const findArg = (nodeRuns.find as any).mock.calls[0][0];
    const inValues = extractInValues(findArg.where.nodeId);
    expect(inValues).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    expect(inValues).not.toEqual(expect.arrayContaining(['D']));

    // artifacts.delete called with nodeRunId In([nrA,nrB,nrC])
    const artDelArg = (artifacts.delete as any).mock.calls[0][0];
    const nrIds = extractInValues(artDelArg.nodeRunId);
    expect(nrIds).toEqual(expect.arrayContaining(['nrA', 'nrB', 'nrC']));

    // run is re-queued
    expect(runs.update).toHaveBeenCalledWith(
      { id: 'r1' },
      expect.objectContaining({ status: 'queued', error: null, currentNodeId: null }),
    );
    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'workflow.run.status', runId: 'r1' }),
    );
  });

  it('rerunFrom rejects unknown nodeId', async () => {
    const workflows = createMockRepo<WorkflowEntity>({
      findOne: jest.fn(async () => ({
        id: 'w1',
        ownerKey: 'o1',
        graph: { nodes: [{ id: 'A' }] },
      })),
    } as any);
    const runs = createMockRepo<WorkflowRunEntity>({
      findOne: jest.fn(async () => ({ id: 'r1', ownerKey: 'o1', workflowId: 'w1' })) as any,
    });

    const svc = new WorkflowsService(
      workflows as any,
      runs as any,
      createMockRepo<WorkflowNodeRunEntity>() as any,
      createMockRepo<ArtifactEntity>() as any,
      { publish: jest.fn() } as any,
    );

    await expect(svc.rerunFrom('o1', 'r1', 'NOPE')).rejects.toBeInstanceOf(BadRequestException);
  });
});
