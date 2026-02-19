import { Injectable, Logger } from '@nestjs/common';

import { WorkflowsService } from '../workflows.service';
import { SettingsService } from '../../settings/settings.service';
import { ChatEngineService } from '../../chats/chat-engine.service';
import { AssetsService } from '../../assets/assets.service';
import { AssetExtractService } from '../../assets/asset-extract.service';

import type { LmMessage } from '../../common/types/llm.types';
import type { IncomingEdge, WorkflowGraphNode } from '../engine/graph-types';

import { toPrettyText, type WorkflowRenderContext } from '../engine/template-renderer';
import { getNumber, getPath, getString, isJsonObject } from '@shared/index';

import { toJsonObject, toJsonValue } from '../../utils/typed-access';
import {
  COND_FALSE_PORT,
  COND_TRUE_PORT,
  LOOP_END,
  LOOP_START,
} from '../worker/workflow-worker.constants';

import type { LoopRange, NodeExecutionArgs, WorkflowNodeExecutor } from './node-executor.interface';

import { LlmNodeExecutorService } from './llm-node-executor.service';
import { WorkflowToolNodeExecutorService } from './workflow-tool-node-executor.service';
import { WorkflowConditionNodeExecutorService } from './workflow-condition-node-executor.service';
import { WorkflowLoopStartExecutorService } from './workflow-loop-start-executor.service';

function compareIds(a: unknown, b: unknown): number {
  return getString(a).trim().localeCompare(getString(b).trim());
}

@Injectable()
export class WorkflowNodeExecutorService {
  private readonly logger = new Logger(WorkflowNodeExecutorService.name);
  private readonly ownerKey = 'default';

  private readonly executors: Map<string, WorkflowNodeExecutor>;

  constructor(
    private readonly workflows: WorkflowsService,
    private readonly settings: SettingsService,
    private readonly engine: ChatEngineService,
    private readonly assets: AssetsService,
    private readonly assetExtract: AssetExtractService,

    llmExec: LlmNodeExecutorService,
    toolExec: WorkflowToolNodeExecutorService,
    condExec: WorkflowConditionNodeExecutorService,
    loopExec: WorkflowLoopStartExecutorService,
  ) {
    this.executors = new Map<string, WorkflowNodeExecutor>([
      [llmExec.type, llmExec],
      [toolExec.type, toolExec],
      [condExec.type, condExec],
      [loopExec.type, loopExec],
    ]);
  }

  private buildMessages(systemPrompt: string, prompt: string): LmMessage[] {
    const msgs: LmMessage[] = [];
    const sys = (systemPrompt ?? '').trim();
    if (sys) msgs.push({ role: 'system', content: sys });
    msgs.push({ role: 'user', content: prompt });
    return msgs;
  }

  private portIndex(portId?: string): number | null {
    if (!portId) return null;
    const m = /^in-(\d+)$/.exec(portId);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  private toText(value: unknown): string {
    return toPrettyText(value);
  }

  /**
   * Execute a normal (non-loopStart/non-loopEnd) node at top-level.
   */
  async executeNodeTopLevel(args: {
    runId: string;
    nodeId: string;
    node: WorkflowGraphNode;
    nodeById: Map<string, WorkflowGraphNode>;
    incoming: Map<string, IncomingEdge[]>;
    ctx: WorkflowRenderContext;
  }): Promise<void> {
    await this.executeNodeInternal({ ...args, iteration: 0 });
  }

  /**
   * Public wrapper used by WorkflowExecutionFacade + loop executor.
   * This MUST exist so external services can execute nodes for loop iterations.
   */
  async executeNodeInternal(args: NodeExecutionArgs): Promise<void> {
    return this.executeSingleNode(args);
  }

  /**
   * Transitional API:
   * If your worker still calls executeLoopStart directly, keep it for now.
   * Internally it delegates to the loopStart executor (same behavior),
   * so you can later switch the worker to call executeNodeInternal with loopRange.
   */
  async executeLoopStart(args: {
    runId: string;
    nodeId: string;
    node: WorkflowGraphNode;
    nodeById: Map<string, WorkflowGraphNode>;
    incoming: Map<string, IncomingEdge[]>;
    ctx: WorkflowRenderContext;
    range: LoopRange;
  }): Promise<void> {
    const { runId, nodeId, node, nodeById, incoming, ctx, range } = args;

    const exec = this.executors.get('workflow.loopStart');
    if (!exec) {
      throw new Error(`LoopStart executor not registered`);
    }

    await exec.execute({
      runId,
      nodeId,
      node,
      nodeById,
      incoming,
      ctx,
      iteration: 0,
      loopRange: range,
    });
  }

  private async executeSingleNode(args: NodeExecutionArgs): Promise<void> {
    const { runId, nodeId, node, nodeById, incoming, ctx, iteration } = args;

    // Skip if already completed
    const run = await this.workflows.getRun(this.ownerKey, runId);
    const nodeRunsRaw = getPath(run as unknown, 'nodeRuns');
    const nodeRuns = Array.isArray(nodeRunsRaw) ? (nodeRunsRaw as unknown[]) : [];

    const existing = nodeRuns.find((r) => {
      if (!isJsonObject(r)) return false;
      const rid = getString(r.nodeId).trim();
      const it = getNumber(r.iteration) ?? 0;
      return rid === nodeId && it === iteration;
    });
    if (existing && isJsonObject(existing) && getString(existing.status) === 'completed') return;

    await this.workflows.setCurrentNode(runId, nodeId);

    const nodeType = getString(node.type, 'lmstudio.llm');

    // Determine active incoming edges (condition branching)
    const edgesInAll = (incoming.get(nodeId) ?? []).slice();
    const edgesIn = edgesInAll.filter((e) => {
      const srcId = getString(e.source).trim();
      const srcNode = nodeById.get(srcId);
      const srcType = getString(srcNode?.type, 'lmstudio.llm');
      if (srcType !== 'workflow.condition') return true;

      const condOut = ctx.nodes?.[srcId];
      if (typeof condOut !== 'boolean') {
        throw new Error(`Missing/invalid condition output for node ${srcId}`);
      }

      const port = getString(e.sourcePort, COND_TRUE_PORT);
      return condOut ? port === COND_TRUE_PORT : port === COND_FALSE_PORT;
    });

    const activeSourcesSorted = edgesIn
      .map((e) => getString(e.source).trim())
      .filter(Boolean)
      .slice()
      .sort(compareIds);

    // If this node has incoming edges, but none are active, skip execution.
    if (edgesInAll.length > 0 && activeSourcesSorted.length === 0) {
      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        outputText: '',
        outputJson: null,
        primaryArtifactId: null,
        inputSnapshot: { sources: [], note: 'skipped (inactive condition branch)' },
        error: null,
      });
      ctx.nodes[nodeId] = '';
      return;
    }

    // Data-flow vs control-flow: only right->left edges become automatic input.
    const dataEdges = edgesIn.filter(
      (e) =>
        getString(e.sourcePort).trim() === 'port-right' &&
        getString(e.targetPort).trim() === 'port-left',
    );

    const sourcesSorted = dataEdges
      .map((e) => getString(e.source).trim())
      .filter(Boolean)
      .slice()
      .sort(compareIds);

    // Build ctx.input from upstream data deps
    if (sourcesSorted.length === 1) {
      const src = sourcesSorted[0];
      if (!(src in ctx.nodes))
        throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
      ctx.input = ctx.nodes[src];
    } else if (sourcesSorted.length > 1) {
      const parts: string[] = [];
      for (const src of sourcesSorted) {
        if (!(src in ctx.nodes))
          throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
        const t = this.toText(ctx.nodes[src]).trim();
        if (!t) continue;
        parts.push(`### Input from ${src}\n${t}`);
      }
      ctx.input = parts.join('\n\n---\n\n');
    } else {
      ctx.input = null;
    }

    // Dependency set for shortcut templating {{nodeId.*}}
    ctx.__depsForRender = new Set<string>(sourcesSorted);

    // Dispatch: LLM/TOOL/CONDITION/LOOPSTART
    const exec = this.executors.get(nodeType);
    if (exec) {
      await exec.execute(args);
      return;
    }

    // ---- Inline node types kept here (optional to split later) ----

    if (nodeType === 'ui.preview') {
      const text = this.toText(ctx.input);
      const artifact = await this.workflows.createArtifact(runId, null, {
        kind: 'text',
        mimeType: 'text/plain',
        contentText: text,
      });

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        outputText: text,
        outputJson: null,
        primaryArtifactId: artifact.id,
        inputSnapshot: { sources: sourcesSorted, note: 'ui.preview pass-through' },
        error: null,
      });

      ctx.nodes[nodeId] = text;
      return;
    }

    if (nodeType === 'workflow.asset') {
      const assetId = getString(getPath(node, 'config.asset.assetId')).trim();
      if (!assetId) throw new Error(`workflow.asset missing config.asset.assetId (node ${nodeId})`);

      const asset = await this.assets.getById(assetId);
      const extract = getPath(node, 'config.asset.extract') === true;

      let extractedText: string | null = null;
      let extractedJson: unknown | null = null;
      let extractWarnings: string[] = [];
      let extractStats: unknown | null = null;
      let kind: string | null = null;

      if (extract) {
        const r = await this.assetExtract.extractByAssetId(assetId);
        extractedText = r.text;
        extractedJson = r.json;
        extractWarnings = r.warnings;
        extractStats = r.stats;
        kind = r.kind;
      }

      const out = toJsonObject({
        assetId,
        filename: asset.originalFilename,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        sha256: asset.sha256,
        docRead: { assetId },
        kind,
        extractedText,
        extractedJson: toJsonValue(extractedJson),
        extractWarnings,
        extractStats: toJsonValue(extractStats),
      });

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        outputText: extractedText ?? '',
        outputJson: out,
        primaryArtifactId: null,
        inputSnapshot: { sources: sourcesSorted, note: 'workflow.asset' },
        error: null,
      });

      ctx.nodes[nodeId] = out;
      return;
    }

    if (nodeType === 'workflow.merge') {
      const edges = (incoming.get(nodeId) ?? []).slice();
      edges.sort((a, b) => {
        const ai = this.portIndex(getString(a.targetPort).trim());
        const bi = this.portIndex(getString(b.targetPort).trim());
        if (ai !== null && bi !== null && ai !== bi) return ai - bi;
        if (ai !== null && bi === null) return -1;
        if (ai === null && bi !== null) return 1;
        return getString(a.id).trim().localeCompare(getString(b.id).trim());
      });

      const sources = edges.map((e) => getString(e.source).trim()).filter(Boolean);

      const parts: string[] = [];
      for (const src of sources) {
        if (!(src in ctx.nodes))
          throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
        parts.push(this.toText(ctx.nodes[src]));
      }

      const sep = getString(getPath(node, 'config.merge.separator'), '\n\n');
      const text = parts.join(String(sep));

      const artifact = await this.workflows.createArtifact(runId, null, {
        kind: 'text',
        mimeType: 'text/plain',
        contentText: text,
      });

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        outputText: text,
        outputJson: null,
        primaryArtifactId: artifact.id,
        inputSnapshot: { sources, separator: String(sep), note: 'workflow.merge' },
        error: null,
      });

      ctx.nodes[nodeId] = text;
      return;
    }

    if (nodeType === 'workflow.export') {
      if (sourcesSorted.length !== 1) {
        throw new Error(`workflow.export requires exactly 1 input (got ${sourcesSorted.length})`);
      }

      const src = sourcesSorted[0];
      if (!(src in ctx.nodes))
        throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);

      const text = this.toText(ctx.nodes[src]);
      const filename =
        getString(getPath(node, 'config.export.filename')).trim() ||
        `export-${runId}-${nodeId}.txt`;

      const artifact = await this.workflows.createArtifact(runId, null, {
        kind: 'text',
        mimeType: 'text/plain',
        filename: String(filename),
        contentText: text,
      });

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        outputText: text,
        outputJson: null,
        primaryArtifactId: artifact.id,
        inputSnapshot: {
          sources: sourcesSorted,
          filename: String(filename),
          note: 'workflow.export',
        },
        error: null,
      });

      ctx.nodes[nodeId] = text;
      return;
    }

    if (nodeType === LOOP_START || nodeType === LOOP_END) {
      // Structural nodes are handled by loop executor / worker.
      return;
    }

    throw new Error(`Unsupported node type: ${nodeType}`);
  }
}
