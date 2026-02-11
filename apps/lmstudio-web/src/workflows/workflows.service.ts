/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WorkflowEntity } from './entities/workflow.entity';
import { WorkflowRunEntity, WorkflowRunStatus } from './entities/workflow-run.entity';
import { WorkflowNodeRunEntity, WorkflowNodeRunStatus } from './entities/workflow-node-run.entity';
import { ArtifactEntity, ArtifactKind } from './entities/artifact.entity';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorkflowRunDto } from './dto/create-workflow-run.dto';
import { SseBusService } from '../sse/sse-bus.service';

type WorkflowExportBundle = {
  workflow: WorkflowEntity;
  runs?: WorkflowRunEntity[];
  nodeRuns?: WorkflowNodeRunEntity[];
  artifacts?: ArtifactEntity[];
};
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

  async list(ownerKey: string) {
    return this.workflows.find({
      where: { ownerKey },
      order: { updatedAt: 'DESC' },
    });
  }

  async get(ownerKey: string, workflowId: string) {
    const wf = await this.workflows.findOne({ where: { id: workflowId, ownerKey } });
    if (!wf) throw new NotFoundException(`Workflow not found: ${workflowId}`);
    return wf;
  }

  async create(ownerKey: string, dto: CreateWorkflowDto) {
    const wf = this.workflows.create({
      ownerKey,
      name: dto.name,
      description: dto.description ?? null,
      graph: dto.graph ?? { nodes: [] },
    });
    return this.workflows.save(wf);
  }

  async update(ownerKey: string, workflowId: string, dto: UpdateWorkflowDto) {
    const wf = await this.get(ownerKey, workflowId);

    wf.name = dto.name ?? wf.name;
    wf.description = dto.description ?? wf.description;
    if (dto.graph !== undefined) wf.graph = dto.graph;

    return this.workflows.save(wf);
  }

  async delete(ownerKey: string, workflowId: string) {
    const wf = await this.get(ownerKey, workflowId);
    await this.workflows.delete({ id: wf.id });
    this.sse.publish({
      type: 'sidebar.changed',
      payload: { reason: 'workflow-deleted' },
    });
    return { ok: true };
  }

  async createRun(ownerKey: string, workflowId: string, dto: CreateWorkflowRunDto) {
    const wf = await this.get(ownerKey, workflowId);

    const run = this.runs.create({
      ownerKey,
      workflowId: wf.id,
      status: 'queued',
      label: dto.label ?? null,
      stats: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      currentNodeId: null,
      lockedBy: null,
      lockedAt: null,
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
        stats: saved.stats ?? null,
      },
    });

    return saved;
  }

  async listRuns(ownerKey: string, q: { workflowId?: string; status?: any; limit?: number }) {
    const where: any = { ownerKey };
    if (q.workflowId) where.workflowId = q.workflowId;
    if (q.status) where.status = q.status;

    const limit = Math.min(Math.max(Number(q.limit ?? 50), 1), 200);

    return this.runs.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getRun(ownerKey: string, runId: string) {
    const run = await this.runs.findOne({ where: { id: runId, ownerKey } });
    if (!run) throw new NotFoundException(`WorkflowRun not found: ${runId}`);

    const nodeRuns = await this.nodeRuns.find({
      where: { workflowRunId: runId },
      order: { iteration: 'ASC', createdAt: 'ASC' },
    });

    const artifacts = await this.artifacts.find({
      where: { workflowRunId: runId },
      order: { createdAt: 'ASC' },
    });

    return { run, nodeRuns, artifacts };
  }

  async claimNextQueued(ownerKey: string, lockedBy: string) {
    const run = await this.runs.findOne({
      where: { ownerKey, status: 'queued' as WorkflowRunStatus },
      order: { createdAt: 'ASC' },
    });
    if (!run) return null;

    await this.runs.update(
      { id: run.id },
      {
        status: 'running',
        lockedBy,
        lockedAt: new Date(),
        startedAt: new Date(),
      },
    );

    const updated = await this.runs.findOne({ where: { id: run.id } });
    if (!updated) return null;

    this.sse.publish({
      type: 'workflow.run.status',
      workflowId: updated.workflowId,
      runId: updated.id,
      payload: {
        status: updated.status,
        currentNodeId: updated.currentNodeId,
        error: updated.error,
        stats: updated.stats ?? null,
      },
    });

    return updated;
  }

  async setCurrentNode(runId: string, nodeId: string | null) {
    await this.runs.update({ id: runId }, { currentNodeId: nodeId });

    const updated = await this.runs.findOne({ where: { id: runId } });
    if (!updated) return;

    this.sse.publish({
      type: 'workflow.run.status',
      workflowId: updated.workflowId,
      runId: updated.id,
      payload: {
        status: updated.status,
        currentNodeId: updated.currentNodeId,
        error: updated.error,
        stats: updated.stats ?? null,
      },
    });
  }

  async markRunCompleted(runId: string) {
    await this.runs.update(
      { id: runId },
      { status: 'completed', finishedAt: new Date(), lockedBy: null, lockedAt: null },
    );

    const updated = await this.runs.findOne({ where: { id: runId } });
    if (!updated) return;

    this.sse.publish({
      type: 'workflow.run.status',
      workflowId: updated.workflowId,
      runId: updated.id,
      payload: {
        status: updated.status,
        currentNodeId: updated.currentNodeId,
        error: updated.error,
        stats: updated.stats ?? null,
      },
    });
  }

  async markRunFailed(runId: string, error: string) {
    await this.runs.update(
      { id: runId },
      { status: 'failed', error, finishedAt: new Date(), lockedBy: null, lockedAt: null },
    );

    const updated = await this.runs.findOne({ where: { id: runId } });
    if (!updated) return;

    this.sse.publish({
      type: 'workflow.run.status',
      workflowId: updated.workflowId,
      runId: updated.id,
      payload: {
        status: updated.status,
        currentNodeId: updated.currentNodeId,
        error: updated.error,
        stats: updated.stats ?? null,
      },
    });
  }

  async markRunCanceled(runId: string, reason: string | null = null) {
    await this.runs.update(
      { id: runId },
      {
        status: 'canceled',
        error: reason,
        finishedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        currentNodeId: null,
      },
    );

    const updated = await this.runs.findOne({ where: { id: runId } });
    if (!updated) return;

    this.sse.publish({
      type: 'workflow.run.status',
      workflowId: updated.workflowId,
      runId: updated.id,
      payload: {
        status: updated.status,
        currentNodeId: updated.currentNodeId,
        error: updated.error,
        stats: updated.stats ?? null,
      },
    });
  }

  async getRunStatus(ownerKey: string, runId: string): Promise<WorkflowRunStatus | null> {
    const run = await this.runs.findOne({ where: { id: runId, ownerKey }, select: ['status'] });
    return run?.status ?? null;
  }

  async pauseRun(ownerKey: string, runId: string) {
    const run = await this.runs.findOne({ where: { id: runId, ownerKey } });
    if (!run) throw new NotFoundException(`WorkflowRun not found: ${runId}`);

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') {
      return run;
    }

    await this.runs.update(
      { id: runId },
      {
        status: 'paused',
        lockedBy: null,
        lockedAt: null,
      },
    );

    const updated = await this.runs.findOne({ where: { id: runId } });
    if (!updated) return run;

    this.sse.publish({
      type: 'workflow.run.status',
      workflowId: updated.workflowId,
      runId: updated.id,
      payload: {
        status: updated.status,
        currentNodeId: updated.currentNodeId,
        error: updated.error,
        stats: updated.stats ?? null,
      },
    });

    return updated;
  }

  async resumeRun(ownerKey: string, runId: string) {
    const run = await this.runs.findOne({ where: { id: runId, ownerKey } });
    if (!run) throw new NotFoundException(`WorkflowRun not found: ${runId}`);

    if (run.status !== 'paused') return run;

    await this.runs.update(
      { id: runId },
      {
        status: 'queued',
        lockedBy: null,
        lockedAt: null,
      },
    );

    const updated = await this.runs.findOne({ where: { id: runId } });
    if (!updated) return run;

    this.sse.publish({
      type: 'workflow.run.status',
      workflowId: updated.workflowId,
      runId: updated.id,
      payload: {
        status: updated.status,
        currentNodeId: updated.currentNodeId,
        error: updated.error,
        stats: updated.stats ?? null,
      },
    });

    return updated;
  }

  async cancelRun(ownerKey: string, runId: string, reason: string | null = 'canceled') {
    const run = await this.runs.findOne({ where: { id: runId, ownerKey } });
    if (!run) throw new NotFoundException(`WorkflowRun not found: ${runId}`);

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') {
      return run;
    }

    await this.markRunCanceled(runId, reason);
    const updated = await this.runs.findOne({ where: { id: runId } });
    return updated ?? run;
  }

  async upsertNodeRun(
    runId: string,
    nodeId: string,
    patch: Partial<{
      iteration: number;
      status: WorkflowNodeRunStatus;
      inputSnapshot: any;
      outputText: string | null;
      outputJson: any;
      primaryArtifactId: string | null;
      error: string | null;
      startedAt: Date | null;
      finishedAt: Date | null;
    }>,
  ) {
    const iteration = Number.isFinite(Number(patch.iteration)) ? Number(patch.iteration) : 0;
    let nr = await this.nodeRuns.findOne({ where: { workflowRunId: runId, nodeId, iteration } });

    if (!nr) {
      nr = this.nodeRuns.create({
        workflowRunId: runId,
        nodeId,
        iteration,
        status: patch.status ?? 'pending',
        inputSnapshot: patch.inputSnapshot ?? null,
        outputText: patch.outputText ?? null,
        outputJson: patch.outputJson ?? null,
        primaryArtifactId: patch.primaryArtifactId ?? null,
        error: patch.error ?? null,
        startedAt: patch.startedAt ?? null,
        finishedAt: patch.finishedAt ?? null,
      });
    } else {
      if (patch.status !== undefined) nr.status = patch.status;
      if (patch.inputSnapshot !== undefined) nr.inputSnapshot = patch.inputSnapshot;
      if (patch.outputText !== undefined) nr.outputText = patch.outputText;
      if (patch.outputJson !== undefined) nr.outputJson = patch.outputJson;
      if (patch.primaryArtifactId !== undefined) nr.primaryArtifactId = patch.primaryArtifactId;
      if (patch.error !== undefined) nr.error = patch.error;
      if (patch.startedAt !== undefined) nr.startedAt = patch.startedAt;
      if (patch.finishedAt !== undefined) nr.finishedAt = patch.finishedAt;
    }

    const saved = await this.nodeRuns.save(nr);

    const run = await this.runs.findOne({ where: { id: runId } });
    if (run) {
      this.sse.publish({
        type: 'workflow.node-run.upsert',
        workflowId: run.workflowId,
        runId,
        nodeId,
        payload: {
          id: saved.id,
          workflowRunId: saved.workflowRunId,
          nodeId: saved.nodeId,
          status: saved.status,
          inputSnapshot: saved.inputSnapshot ?? null,
          outputText: saved.outputText ?? null,
          outputJson: saved.outputJson ?? null,
          primaryArtifactId: saved.primaryArtifactId,
          error: saved.error,
          startedAt: saved.startedAt,
          finishedAt: saved.finishedAt,
          createdAt: saved.createdAt,
        },
      });
    }

    return saved;
  }

  async createArtifact(
    runId: string,
    nodeRunId: string | null,
    payload: Partial<{
      kind: ArtifactKind;
      mimeType: string | null;
      filename: string | null;
      contentText: string | null;
      contentJson: any;
      blobPath: string | null;
    }>,
  ) {
    const nodeId = nodeRunId
      ? ((await this.nodeRuns.findOne({ where: { id: nodeRunId } }))?.nodeId ?? null)
      : null;

    const a = this.artifacts.create({
      workflowRunId: runId,
      nodeRunId,
      kind: payload.kind ?? 'text',
      mimeType: payload.mimeType ?? null,
      filename: payload.filename ?? null,
      contentText: payload.contentText ?? null,
      contentJson: payload.contentJson ?? null,
      blobPath: payload.blobPath ?? null,
    });

    const saved = await this.artifacts.save(a);

    const run = await this.runs.findOne({ where: { id: runId } });

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
   * Load a single artifact by id.
   *
   * Artifacts are scoped by ownerKey through their workflow run.
   */
  async getArtifact(ownerKey: string, artifactId: string) {
    const artifact = await this.artifacts.findOne({
      where: { id: artifactId },
    });
    if (!artifact) throw new NotFoundException(`Artifact not found: ${artifactId}`);

    const run = await this.runs.findOne({
      where: { id: artifact.workflowRunId, ownerKey },
      select: ['id'],
    });
    if (!run) throw new NotFoundException(`Artifact not found: ${artifactId}`);

    return artifact;
  }

  /**
   * Export a workflow as a single JSON bundle.
   *
   * - includeRuns: includes workflow runs and their nodeRuns/artifacts
   * - limitRuns: caps number of runs (most recent first)
   */
  async exportWorkflowBundle(
    ownerKey: string,
    workflowId: string,
    opts: { includeRuns: boolean; limitRuns: number },
  ): Promise<WorkflowExportBundle> {
    const workflow = await this.get(ownerKey, workflowId);

    if (!opts.includeRuns) {
      return { workflow };
    }

    const limit = Math.min(Math.max(Number(opts.limitRuns ?? 50), 1), 500);

    const runs = await this.runs.find({
      where: { ownerKey, workflowId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    const runIds = runs.map((r) => r.id);
    if (!runIds.length) {
      return { workflow, runs: [], nodeRuns: [], artifacts: [] };
    }

    const nodeRuns = await this.nodeRuns.find({
      where: { workflowRunId: runIds as any },
      order: { createdAt: 'ASC' },
    });

    const artifacts = await this.artifacts.find({
      where: { workflowRunId: runIds as any },
      order: { createdAt: 'ASC' },
    });

    return { workflow, runs, nodeRuns, artifacts };
  }

  async importWorkflowBundle(
    ownerKey: string,
    dto: { bundle: any; name?: string },
  ): Promise<WorkflowEntity> {
    const bundle = dto.bundle;
    if (!bundle?.workflow) {
      throw new BadRequestException('Invalid bundle: missing workflow');
    }

    const wf = this.workflows.create({
      ownerKey,
      name: dto.name ?? bundle.workflow.name ?? 'Imported Workflow',
      description: bundle.workflow.description ?? null,
      graph: bundle.workflow.graph ?? { nodes: [] },
    });

    const saved = await this.workflows.save(wf);

    this.sse.publish({
      type: 'sidebar.changed',
      payload: { reason: 'workflow-imported' },
    });

    return saved;
  }

  /**
   * Rerun-from: delete downstream node runs + artifacts and set run back to queued.
   * v2: downstream is derived from edges + prompt/type dependencies (matching worker behavior).
   */
  async rerunFrom(ownerKey: string, runId: string, nodeId: string) {
    const run = await this.runs.findOne({ where: { id: runId, ownerKey } });
    if (!run) throw new NotFoundException(`WorkflowRun not found: ${runId}`);

    const wf = await this.workflows.findOne({ where: { id: run.workflowId, ownerKey } });
    if (!wf) throw new NotFoundException(`Workflow not found: ${run.workflowId}`);

    const graph = wf.graph ?? {};
    const nodes: any[] = Array.isArray(graph.nodes) ? graph.nodes : [];

    const ids = nodes.map((n) => String(n?.id ?? '')).filter(Boolean);
    const nodeIds = new Set(ids);

    if (!nodeIds.has(nodeId)) throw new BadRequestException(`Unknown nodeId: ${nodeId}`);

    const promptNeedsInput = (prompt: string) =>
      /\{\{\s*input(?:\.[^}]+)?\s*\}\}/.test(prompt ?? '');

    const extractNodeRefs = (prompt: string): string[] => {
      const txt = String(prompt ?? '');
      const out: string[] = [];
      const rx = /\{\{\s*(?:nodes|steps)\.([a-zA-Z0-9_-]+)(?:\.[^}]+)?\s*\}\}/g;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(txt))) out.push(m[1]);
      return out;
    };

    type Edge = { source: string; target: string };

    const normalizeEdges = (): Edge[] => {
      const raw: any[] = Array.isArray(graph?.edges) ? graph.edges : [];
      const out: Edge[] = [];

      for (const e of raw) {
        const source = String(e?.source ?? '').trim();
        const target = String(e?.target ?? '').trim();
        if (!source || !target) continue;
        if (source === target) continue;
        if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
        out.push({ source, target });
      }

      if (!out.length) {
        for (const n of nodes) {
          const target = String(n?.id ?? '').trim();
          const source = typeof n?.inputFrom === 'string' ? n.inputFrom.trim() : '';
          if (!source || !target) continue;
          if (source === target) continue;
          if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
          out.push({ source, target });
        }
      }

      const seen = new Set<string>();
      const deduped: Edge[] = [];
      for (const e of out) {
        const k = `${e.source}->${e.target}`;
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(e);
      }

      return deduped;
    };

    const edges = normalizeEdges();

    const incoming = new Map<string, string[]>();
    for (const e of edges) {
      if (!incoming.has(e.target)) incoming.set(e.target, []);
      incoming.get(e.target)!.push(e.source);
    }
    for (const [k, arr] of incoming) arr.sort((a, b) => a.localeCompare(b));

    const nodeById = new Map<string, any>();
    for (const n of nodes) if (n?.id) nodeById.set(String(n.id), n);

    const adj = new Map<string, Set<string>>();

    for (const id of ids) {
      const n = nodeById.get(id);
      if (!n) continue;

      const nodeType = String(n.type ?? 'lmstudio.llm');
      const prompt = String(n.prompt ?? '');

      const needsEdgeInput =
        nodeType === 'workflow.condition' ||
        nodeType === 'workflow.loop' ||
        nodeType === 'workflow.merge' ||
        nodeType === 'workflow.export' ||
        nodeType === 'ui.preview' ||
        promptNeedsInput(prompt);

      const deps = new Set<string>();

      if (needsEdgeInput) {
        for (const src of incoming.get(id) ?? []) {
          if (nodeIds.has(src) && src !== id) deps.add(src);
        }
      }

      for (const ref of extractNodeRefs(prompt)) {
        if (nodeIds.has(ref) && ref !== id) deps.add(ref);
      }

      for (const from of deps) {
        if (!adj.has(from)) adj.set(from, new Set());
        adj.get(from)!.add(id);
      }
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
  }
}
