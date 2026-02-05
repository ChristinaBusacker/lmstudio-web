/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SseBusService } from '../sse/sse-bus.service';
import { WorkflowEntity } from './entities/workflow.entity';
import { WorkflowRunEntity, WorkflowRunStatus } from './entities/workflow-run.entity';
import { WorkflowNodeRunEntity } from './entities/workflow-node-run.entity';
import { ArtifactEntity } from './entities/artifact.entity';

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(WorkflowEntity) private readonly workflows: Repository<WorkflowEntity>,
    @InjectRepository(WorkflowRunEntity) private readonly runs: Repository<WorkflowRunEntity>,
    @InjectRepository(WorkflowNodeRunEntity)
    private readonly nodeRuns: Repository<WorkflowNodeRunEntity>,
    @InjectRepository(ArtifactEntity) private readonly artifacts: Repository<ArtifactEntity>,
    private readonly sse: SseBusService,
  ) {}

  // --------------------------------------------------------------------------------------------
  // Workflows
  // --------------------------------------------------------------------------------------------

  async create(ownerKey: string, dto: { name: string; description?: string; graph: any }) {
    if (!dto.graph || typeof dto.graph !== 'object')
      throw new BadRequestException('graph must be an object');

    const entity = this.workflows.create({
      ownerKey,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      graph: dto.graph,
    });

    return this.workflows.save(entity);
  }

  async list(ownerKey: string) {
    return this.workflows.find({ where: { ownerKey }, order: { updatedAt: 'DESC' } });
  }

  async get(ownerKey: string, id: string) {
    const wf = await this.workflows.findOne({ where: { id, ownerKey } });
    if (!wf) throw new NotFoundException(`Workflow not found: ${id}`);
    return wf;
  }

  async update(ownerKey: string, id: string, patch: any) {
    const wf = await this.get(ownerKey, id);

    if (patch.name !== undefined) wf.name = String(patch.name).trim();
    if (patch.description !== undefined)
      wf.description = patch.description ? String(patch.description).trim() : null;
    if (patch.graph !== undefined) wf.graph = patch.graph;

    return this.workflows.save(wf);
  }

  // --------------------------------------------------------------------------------------------
  // Runs
  // --------------------------------------------------------------------------------------------

  async createRun(ownerKey: string, workflowId: string, dto?: { label?: string }) {
    await this.get(ownerKey, workflowId);

    const run = this.runs.create({
      workflowId,
      ownerKey,
      status: 'queued',
      currentNodeId: null,
      label: dto?.label?.trim() ?? null,
      stats: null,
      error: null,
      lockedBy: null,
      lockedAt: null,
      startedAt: null,
      finishedAt: null,
    });

    const saved = await this.runs.save(run);

    this.sse.publish({
      type: 'workflow.run.status',
      workflowId,
      runId: saved.id,
      payload: {
        status: saved.status,
        currentNodeId: saved.currentNodeId,
        error: saved.error,
        stats: saved.stats,
      },
    });

    return saved;
  }

  async listRuns(
    ownerKey: string,
    params?: { workflowId?: string; status?: WorkflowRunStatus; limit?: number },
  ) {
    const limit = Math.min(params?.limit ?? 50, 200);
    const where: any = { ownerKey };

    if (params?.workflowId) where.workflowId = params.workflowId;
    if (params?.status) where.status = params.status;

    return this.runs.find({ where, order: { createdAt: 'DESC' }, take: limit });
  }

  async getRun(ownerKey: string, runId: string) {
    const run = await this.runs.findOne({ where: { id: runId, ownerKey } });
    if (!run) throw new NotFoundException(`WorkflowRun not found: ${runId}`);

    const nodeRuns = await this.nodeRuns.find({
      where: { workflowRunId: run.id },
      order: { createdAt: 'ASC' },
    });
    const artifacts = await this.artifacts.find({
      where: { workflowRunId: run.id },
      order: { createdAt: 'ASC' },
    });

    return { run, nodeRuns, artifacts };
  }

  async claimNextQueued(ownerKey: string, lockedBy: string): Promise<WorkflowRunEntity | null> {
    const next = await this.runs.findOne({
      where: { ownerKey, status: 'queued' as WorkflowRunStatus },
      order: { createdAt: 'ASC' },
    });
    if (!next) return null;

    const now = new Date();
    const res = await this.runs.update(
      { id: next.id, status: 'queued' as WorkflowRunStatus },
      { status: 'running', lockedBy, lockedAt: now, startedAt: now },
    );
    if (res.affected !== 1) return null;

    const updated = await this.runs.findOne({ where: { id: next.id } });
    if (updated) {
      this.sse.publish({
        type: 'workflow.run.status',
        workflowId: updated.workflowId,
        runId: updated.id,
        payload: {
          status: updated.status,
          currentNodeId: updated.currentNodeId,
          error: updated.error,
          stats: updated.stats,
        },
      });
    }
    return updated;
  }

  async markRunCompleted(runId: string) {
    const run = await this.runs.findOne({ where: { id: runId } });

    await this.runs.update(
      { id: runId },
      {
        status: 'completed',
        finishedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        error: null,
        currentNodeId: null,
      },
    );

    if (run) {
      this.sse.publish({
        type: 'workflow.run.status',
        workflowId: run.workflowId,
        runId: run.id,
        payload: {
          status: 'completed',
          currentNodeId: null,
          error: null,
          stats: run.stats ?? null,
        },
      });
    }
  }

  async markRunFailed(runId: string, message: string) {
    const run = await this.runs.findOne({ where: { id: runId } });

    await this.runs.update(
      { id: runId },
      {
        status: 'failed',
        finishedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        error: message,
        currentNodeId: null,
      },
    );

    if (run) {
      this.sse.publish({
        type: 'workflow.run.status',
        workflowId: run.workflowId,
        runId: run.id,
        payload: {
          status: 'failed',
          currentNodeId: null,
          error: message,
          stats: run.stats ?? null,
        },
      });
    }
  }

  async setCurrentNode(runId: string, nodeId: string | null) {
    const run = await this.runs.findOne({ where: { id: runId } });
    await this.runs.update({ id: runId }, { currentNodeId: nodeId });

    if (run) {
      this.sse.publish({
        type: 'workflow.run.status',
        workflowId: run.workflowId,
        runId: run.id,
        payload: {
          status: run.status,
          currentNodeId: nodeId,
          error: run.error,
          stats: run.stats ?? null,
        },
      });
    }
  }

  async upsertNodeRun(runId: string, nodeId: string, patch: Partial<WorkflowNodeRunEntity>) {
    const run = await this.runs.findOne({ where: { id: runId } });

    const existing = await this.nodeRuns.findOne({ where: { workflowRunId: runId, nodeId } });
    if (existing) {
      Object.assign(existing, patch);
      const saved = await this.nodeRuns.save(existing);

      if (run) {
        this.sse.publish({
          type: 'workflow.node-run.upsert',
          workflowId: run.workflowId,
          runId,
          nodeId,
          payload: {
            nodeId,
            status: saved.status,
            error: saved.error,
            startedAt: saved.startedAt ? saved.startedAt.toISOString() : null,
            finishedAt: saved.finishedAt ? saved.finishedAt.toISOString() : null,
          },
        });
      }

      return saved;
    }

    const nr = this.nodeRuns.create({
      workflowRunId: runId,
      nodeId,
      status: 'pending',
      inputSnapshot: null,
      outputText: null,
      outputJson: null,
      primaryArtifactId: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      ...patch,
    });

    const saved = await this.nodeRuns.save(nr);

    if (run) {
      this.sse.publish({
        type: 'workflow.node-run.upsert',
        workflowId: run.workflowId,
        runId,
        nodeId,
        payload: {
          nodeId,
          status: saved.status,
          error: saved.error,
          startedAt: saved.startedAt ? saved.startedAt.toISOString() : null,
          finishedAt: saved.finishedAt ? saved.finishedAt.toISOString() : null,
        },
      });
    }

    return saved;
  }

  async createArtifact(runId: string, nodeRunId: string | null, patch: Partial<ArtifactEntity>) {
    const run = await this.runs.findOne({ where: { id: runId } });

    const nodeId = nodeRunId
      ? ((await this.nodeRuns.findOne({ where: { id: nodeRunId } }))?.nodeId ?? null)
      : null;

    const a = this.artifacts.create({
      workflowRunId: runId,
      nodeRunId,
      kind: 'text',
      mimeType: null,
      filename: null,
      contentText: null,
      contentJson: null,
      blobPath: null,
      ...patch,
    });

    const saved = await this.artifacts.save(a);

    if (run) {
      this.sse.publish({
        type: 'workflow.artifact.created',
        workflowId: run.workflowId,
        runId,
        nodeId: nodeId ?? undefined,
        artifactId: saved.id,
        payload: {
          artifactId: saved.id,
          nodeId,
          kind: saved.kind,
          mimeType: saved.mimeType,
          filename: saved.filename,
        },
      });
    }

    return saved;
  }

  /**
   * Rerun-from: delete downstream node runs + artifacts and set run back to queued.
   * Uses edges source/target.
   */
  async rerunFrom(ownerKey: string, runId: string, nodeId: string) {
    const run = await this.runs.findOne({ where: { id: runId, ownerKey } });
    if (!run) throw new NotFoundException(`WorkflowRun not found: ${runId}`);

    const wf = await this.workflows.findOne({ where: { id: run.workflowId, ownerKey } });
    if (!wf) throw new NotFoundException(`Workflow not found: ${run.workflowId}`);

    const graph = wf.graph ?? {};
    const nodes: any[] = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges: any[] = Array.isArray(graph.edges) ? graph.edges : [];

    const nodeIds = new Set(nodes.map((n) => n?.id).filter(Boolean));
    if (!nodeIds.has(nodeId)) throw new BadRequestException(`Unknown nodeId: ${nodeId}`);

    const adj = new Map<string, Set<string>>();
    for (const e of edges) {
      const from = e?.source;
      const to = e?.target;
      if (!from || !to) continue;
      if (!adj.has(from)) adj.set(from, new Set());
      adj.get(from)!.add(to);
    }

    const downstream = new Set<string>();
    const stack = [nodeId];
    while (stack.length) {
      const cur = stack.pop()!;
      downstream.add(cur);
      const nexts = adj.get(cur);
      if (!nexts) continue;
      for (const nx of nexts) if (!downstream.has(nx)) stack.push(nx);
    }

    const affectedNodeRuns = await this.nodeRuns.find({
      where: { workflowRunId: runId, nodeId: In([...downstream]) as any },
    });
    const affectedNodeRunIds = affectedNodeRuns.map((r) => r.id);

    if (affectedNodeRunIds.length) {
      await this.artifacts.delete({
        workflowRunId: runId,
        nodeRunId: In(affectedNodeRunIds) as any,
      });
      await this.nodeRuns.delete({ workflowRunId: runId, nodeId: In([...downstream]) as any });
    }

    await this.runs.update(
      { id: runId },
      {
        status: 'queued',
        error: null,
        finishedAt: null,
        lockedBy: null,
        lockedAt: null,
        startedAt: null,
        currentNodeId: null,
      },
    );

    const updated = await this.runs.findOne({ where: { id: runId } });
    if (updated) {
      this.sse.publish({
        type: 'workflow.run.status',
        workflowId: updated.workflowId,
        runId: updated.id,
        payload: {
          status: updated.status,
          currentNodeId: null,
          error: null,
          stats: updated.stats ?? null,
        },
      });
    }

    return updated;
  }
}
