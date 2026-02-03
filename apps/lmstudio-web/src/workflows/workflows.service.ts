/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
  ) {}

  // --------------------------------------------------------------------------------------------
  // Workflows
  // --------------------------------------------------------------------------------------------

  async create(ownerKey: string, dto: { name: string; description?: string; graph: any }) {
    if (!dto.graph || typeof dto.graph !== 'object') {
      throw new BadRequestException('graph must be an object');
    }

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

    return this.runs.save(run);
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

    return this.runs.findOne({ where: { id: next.id } });
  }

  async markRunCompleted(runId: string) {
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
  }

  async markRunFailed(runId: string, message: string) {
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
  }

  async setCurrentNode(runId: string, nodeId: string | null) {
    await this.runs.update({ id: runId }, { currentNodeId: nodeId });
  }

  async upsertNodeRun(runId: string, nodeId: string, patch: Partial<WorkflowNodeRunEntity>) {
    const existing = await this.nodeRuns.findOne({ where: { workflowRunId: runId, nodeId } });
    if (existing) {
      Object.assign(existing, patch);
      return this.nodeRuns.save(existing);
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

    return this.nodeRuns.save(nr);
  }

  async createArtifact(runId: string, nodeRunId: string | null, patch: Partial<ArtifactEntity>) {
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
    return this.artifacts.save(a);
  }

  /**
   * Rerun-from: delete downstream node runs + artifacts and set run back to queued.
   * V1: uses edges to compute downstream closure.
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

    // downstream closure
    const adj = new Map<string, Set<string>>();
    for (const e of edges) {
      const from = e?.from;
      const to = e?.to;
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
      for (const nx of nexts) {
        if (!downstream.has(nx)) stack.push(nx);
      }
    }

    // Delete node runs for affected nodes (and their artifacts)
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

    // Set run back to queued
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

    return this.runs.findOne({ where: { id: runId } });
  }
}
