import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';

import type { WorkflowGraph } from './engine/graph-types';
import { buildDependencies, topoSort } from './engine/dependency-graph';
import { normalizeWorkflowGraph } from './engine/graph-normalizer';
import type { WorkflowRenderContext } from './engine/template-renderer';
import { getNumber, getPath, getString, isJsonObject } from '@shared/index';

import { LOOP_END, LOOP_START } from './worker/workflow-worker.constants';
import { WorkflowNodeExecutorService } from './execution/workflow-node-executor.service';
import { LoopRange } from './execution/node-executor.interface';

@Injectable()
export class WorkflowWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowWorkerService.name);

  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  private readonly ownerKey = 'default';
  private readonly lockedBy = 'workflow-worker-1';
  private readonly POLL_MS = 300;

  constructor(
    private readonly workflows: WorkflowsService,
    private readonly executor: WorkflowNodeExecutorService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), this.POLL_MS);
    this.logger.log('Workflow worker started');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.isTickRunning) return;
    this.isTickRunning = true;

    try {
      const run = await this.workflows.claimNextQueued(this.ownerKey, this.lockedBy);
      if (!run) return;

      this.logger.log(`Claimed workflow run ${run.id}`);
      await this.executeRun(run.id, run.workflowId);
    } catch (err: unknown) {
      const msg = isJsonObject(err) ? getString(err.message, String(err)) : String(err);
      this.logger.error(msg);
    } finally {
      this.isTickRunning = false;
    }
  }

  private async shouldStopRun(
    runId: string,
  ): Promise<{ stop: true; reason: 'paused' | 'canceled' | 'finished' } | { stop: false }> {
    const status = await this.workflows.getRunStatus(this.ownerKey, runId);
    if (!status) return { stop: false };

    if (status === 'paused') return { stop: true, reason: 'paused' };
    if (status === 'canceled') return { stop: true, reason: 'canceled' };
    if (status === 'completed' || status === 'failed') return { stop: true, reason: 'finished' };

    return { stop: false };
  }

  private async executeRun(runId: string, workflowId: string) {
    try {
      const wf = await this.workflows.get(this.ownerKey, workflowId);
      const graphRaw = getPath(wf as unknown, 'graph');
      const graph: WorkflowGraph = isJsonObject(graphRaw)
        ? normalizeWorkflowGraph(graphRaw)
        : { nodes: [], edges: [] };

      const nodeOrder = topoSort(graph);
      const { nodeById, incoming } = buildDependencies(graph);

      // Pre-compute loop ranges (loop body = everything between loopStart and the next loopEnd in topo order).
      const loopRanges = new Map<string, LoopRange>();
      const loopBodyIds = new Set<string>();

      for (let i = 0; i < nodeOrder.length; i++) {
        const id = nodeOrder[i];
        const n = nodeById.get(id);
        const t = String(n?.type ?? 'lmstudio.llm');
        if (t !== LOOP_START) continue;

        let endIdx = -1;
        let endId = '';
        for (let j = i + 1; j < nodeOrder.length; j++) {
          const cand = nodeById.get(nodeOrder[j]);
          const ct = String(cand?.type ?? 'lmstudio.llm');
          if (ct === LOOP_END) {
            endIdx = j;
            endId = nodeOrder[j];
            break;
          }
        }

        if (endIdx === -1) throw new Error(`LoopStart ${id} has no matching LoopEnd`);

        const body = nodeOrder.slice(i + 1, endIdx);
        loopRanges.set(id, { body, endId });
        for (const b of body) loopBodyIds.add(b);
        loopBodyIds.add(endId);

        i = endIdx; // skip scanning inside the loop body
      }

      const ctx: WorkflowRenderContext = { nodes: {}, input: null, loop: null };

      // Restore context from already completed node runs (rerun-from support).
      // For nodes with multiple iterations (loops), we keep the latest iteration output.
      const details = await this.workflows.getRun(this.ownerKey, runId);
      const latestByNode = new Map<string, unknown>();
      const bestKey = new Map<string, { iteration: number; createdAt: string }>();

      const nodeRunsRaw = getPath(details as unknown, 'nodeRuns');
      const nodeRuns = Array.isArray(nodeRunsRaw) ? (nodeRunsRaw as unknown[]) : [];
      for (const nr of nodeRuns) {
        if (!isJsonObject(nr)) continue;
        if (getString(nr.status) !== 'completed') continue;

        const nodeId = getString(nr.nodeId).trim();
        if (!nodeId) continue;

        const it = getNumber(nr.iteration) ?? 0;
        const createdAt = getString(nr.createdAt);
        const prev = bestKey.get(nodeId);
        if (!prev || it > prev.iteration || (it === prev.iteration && createdAt > prev.createdAt)) {
          bestKey.set(nodeId, { iteration: it, createdAt });
          const outJson = getPath(nr, 'outputJson');
          const outText = getPath(nr, 'outputText');
          if (outJson !== null && outJson !== undefined) latestByNode.set(nodeId, outJson);
          else if (outText !== null && outText !== undefined) latestByNode.set(nodeId, outText);
        }
      }
      for (const [k, v] of latestByNode) ctx.nodes[k] = v;

      // Execute nodes in topological order.
      for (const nodeId of nodeOrder) {
        const stop = await this.shouldStopRun(runId);
        if (stop.stop) {
          this.logger.log(`Stopping run ${runId} (${stop.reason})`);
          return;
        }

        const node = nodeById.get(nodeId);
        if (!node) continue;

        const nodeType = String(node.type ?? 'lmstudio.llm');

        // Loop bodies are executed by their corresponding loopStart node.
        if (nodeType === LOOP_END) continue;
        if (nodeType !== LOOP_START && loopBodyIds.has(nodeId)) continue;

        await this.workflows.setCurrentNode(runId, nodeId);

        if (nodeType === LOOP_START) {
          const range = loopRanges.get(nodeId);
          if (!range) throw new Error(`LoopStart ${nodeId} has no range metadata`);
          await this.executor.executeLoopStart({
            runId,
            nodeId,
            node,
            nodeById,
            incoming,
            ctx,
            range,
          });
          continue;
        }

        await this.executor.executeNodeTopLevel({
          runId,
          nodeId,
          node,
          nodeById,
          incoming,
          ctx,
        });
      }

      await this.workflows.markRunCompleted(runId);
    } catch (err: unknown) {
      const msg = isJsonObject(err) ? getString(err.message, String(err)) : String(err);
      this.logger.error(msg);
      await this.workflows.markRunFailed(runId, msg);
    }
  }
}
