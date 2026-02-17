import { Injectable, Logger } from '@nestjs/common';
import { WorkflowsService } from '../workflows.service';
import { SettingsService } from '../../settings/settings.service';
import { ChatEngineService } from '../../chats/chat-engine.service';
import { ToolOrchestratorService } from '../../tools/tool-orchestrator.service';
import { AssetsService } from '../../assets/assets.service';
import { AssetExtractService } from '../../assets/asset-extract.service';

import type { LmMessage } from '../../common/types/llm.types';

import type { IncomingEdge, WorkflowGraphNode } from '../engine/graph-types';
import {
  renderTemplate,
  safeJsonParse,
  toPrettyText,
  type WorkflowRenderContext,
} from '../engine/template-renderer';
import { asJsonObject, getNumber, getPath, getString, isJsonObject } from '../engine/typed-access';
import {
  COND_FALSE_PORT,
  COND_TRUE_PORT,
  LOOP_END,
  LOOP_START,
  type LoopMode,
} from '../worker/workflow-worker.constants';

export type LoopRange = {
  body: string[];
  endId: string;
};

@Injectable()
export class WorkflowNodeExecutorService {
  private readonly logger = new Logger(WorkflowNodeExecutorService.name);

  private readonly ownerKey = 'default';

  constructor(
    private readonly workflows: WorkflowsService,
    private readonly settings: SettingsService,
    private readonly engine: ChatEngineService,
    private readonly toolOrchestrator: ToolOrchestratorService,
    private readonly assets: AssetsService,
    private readonly assetExtract: AssetExtractService,
  ) {}

  private parseToolsEnabled(raw: unknown): boolean {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') return raw.toLowerCase() !== 'false';
    if (typeof raw === 'number') return raw !== 0;
    // Default to enabled (matches chat-run behavior)
    return true;
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
    // expects "in-1", "in-2", ...
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
  }) {
    await this.executeSingleNode({ ...args, iteration: 0 });
  }

  /**
   * Execute a structural loopStart node (workflow.loopStart).
   * The loop body nodes are executed per iteration and persisted as nodeRuns.
   */
  async executeLoopStart(args: {
    runId: string;
    nodeId: string;
    node: WorkflowGraphNode;
    nodeById: Map<string, WorkflowGraphNode>;
    incoming: Map<string, IncomingEdge[]>;
    ctx: WorkflowRenderContext;
    range: LoopRange;
  }) {
    const { runId, nodeId, node, nodeById, incoming, ctx, range } = args;

    // Determine active incoming edges (condition branching).
    const edgesInAll = (incoming.get(nodeId) ?? []).slice();
    const edgesIn = edgesInAll.filter((e) => {
      const srcNode = nodeById.get(e.source);
      const srcType = String(srcNode?.type ?? 'lmstudio.llm');
      if (srcType !== 'workflow.condition') return true;

      const condOut = ctx.nodes?.[e.source];
      if (typeof condOut !== 'boolean') {
        throw new Error(`Missing/invalid condition output for node ${e.source}`);
      }

      const port = String(e.sourcePort ?? COND_TRUE_PORT);
      if (condOut === true) return port === COND_TRUE_PORT;
      return port === COND_FALSE_PORT;
    });

    const sourcesSorted = edgesIn
      .map((e) => e.source)
      .slice()
      .sort((a, b) => a.localeCompare(b));

    // Skip when all incoming are inactive (inactive branch).
    if (edgesInAll.length > 0 && sourcesSorted.length === 0) {
      await this.workflows.upsertNodeRun(runId, nodeId, {
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        outputText: '',
        outputJson: null,
        primaryArtifactId: null,
        inputSnapshot: {
          sources: [],
          note: 'skipped (inactive condition branch)',
        },
        error: null,
      });
      ctx.nodes[nodeId] = '';
      return;
    }

    // Build upstream input (loopStart uses regular control-flow incoming edges).
    if (sourcesSorted.length === 1) {
      const src = sourcesSorted[0];
      if (!(src in ctx.nodes)) {
        throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
      }
      ctx.input = ctx.nodes[src];
    } else if (sourcesSorted.length > 1) {
      const obj: Record<string, unknown> = {};
      for (const src of sourcesSorted) {
        if (!(src in ctx.nodes)) {
          throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
        }
        obj[src] = ctx.nodes[src];
      }
      ctx.input = obj;
    } else {
      ctx.input = null;
    }

    const loopCfg = asJsonObject(getPath(node, 'config', 'loop'));
    const maxItRaw = getNumber(loopCfg.maxIterations) ?? 10;
    const maxIterations = Math.max(1, Math.min(1000, maxItRaw));
    const joiner = getString(loopCfg.joiner, '\n\n');
    const mode = getString(loopCfg.mode, 'until') as LoopMode;
    const conditionPrompt = getString(loopCfg.conditionPrompt).trim();

    if (mode !== 'while' && mode !== 'until' && mode !== 'count') {
      throw new Error(`LoopStart ${nodeId} has invalid mode: ${getString(loopCfg.mode)}`);
    }
    if (!conditionPrompt) throw new Error(`LoopStart ${nodeId} missing loop.conditionPrompt`);

    const profileName = String(node.profileName ?? '').trim();
    if (!profileName) throw new Error(`LoopStart ${nodeId} missing profileName`);

    const profile = await this.settings.resolveProfile(this.ownerKey, profileName);
    if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

    const profileObj = asJsonObject(profile as unknown);
    const params: Record<string, unknown> = { ...asJsonObject(profileObj.params) };
    const modelKey = getString(params.modelKey).trim();
    if (!modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

    // Ensure structured output for loop condition.
    params.structuredOutput = {
      enabled: true,
      strict: true,
      name: 'workflow_loop_condition',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { result: { type: 'boolean' } },
        required: ['result'],
      },
    };

    const systemPrompt = getString(profileObj.systemPrompt).trim();

    // Make upstream input available under {{input}} for first iteration templating.
    ctx.nodes[nodeId] = ctx.input;

    const items: string[] = [];
    const startedAt = new Date();

    await this.workflows.upsertNodeRun(runId, nodeId, {
      status: 'running',
      startedAt,
      inputSnapshot: {
        sources: sourcesSorted,
        profileName,
        modelKey,
        loop: { maxIterations, joiner, mode },
        note: 'workflow.loopStart',
      },
      error: null,
    });

    const lastBodyId = range.body.length ? range.body[range.body.length - 1] : null;

    let index = 0;
    while (index < maxIterations) {
      ctx.loop = {
        index,
        iteration: index + 1,
        last: items.length ? items[items.length - 1] : '',
        items: items.slice(),
        joined: items.join(joiner),
      };

      // Execute loop body nodes for this iteration.
      for (const bodyNodeId of range.body) {
        const bodyNode = nodeById.get(bodyNodeId);
        if (!bodyNode) continue;
        const bodyType = String(bodyNode.type ?? 'lmstudio.llm');
        if (bodyType === LOOP_START || bodyType === LOOP_END) {
          throw new Error(
            `Nested loops are not supported yet (found ${bodyType} inside loop body)`,
          );
        }

        await this.executeSingleNode({
          runId,
          nodeId: bodyNodeId,
          node: bodyNode,
          nodeById,
          incoming,
          ctx,
          iteration: index,
        });
      }

      const produced = lastBodyId ? this.toText(ctx.nodes[lastBodyId]) : '';
      items.push(produced);

      // Evaluate loop condition.
      const loopState = {
        index,
        iteration: index + 1,
        produced,
        items: items.slice(),
        joined: items.join(joiner),
      };

      const condInputText = this.toText({
        upstream: ctx.input,
        loop: loopState,
      });

      const renderedCond = renderTemplate(conditionPrompt, {
        ...ctx,
        input: loopState,
      });

      const question =
        mode === 'until'
          ? 'Decide whether the stop condition is satisfied.'
          : 'Decide whether the continue condition is satisfied.';

      const finalPrompt =
        `${question}\n` +
        `Return ONLY a JSON object that matches this schema: {"result": true|false}.\n` +
        `Do not include any other keys, text, or explanation.\n\n` +
        `You are given upstream context from previous workflow steps.\n---\nUPSTREAM_INPUT:\n${condInputText}\n---\n\n` +
        renderedCond;

      const gen = this.engine.streamChat(
        `${runId}:${nodeId}:loop-condition:${index}`,
        this.buildMessages(systemPrompt, finalPrompt),
        params,
      );

      let full = '';
      while (true) {
        const { value, done } = await gen.next();
        if (done) break;
        if (value?.delta) full += value.delta;
      }

      const parsed = safeJsonParse(full.trim());
      if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
        throw new Error(
          `Loop condition did not return valid JSON: ${parsed.ok ? 'invalid object' : parsed.error}`,
        );
      }
      const result = getPath(parsed.value, 'result');
      if (typeof result !== 'boolean') {
        throw new Error(`Loop condition JSON missing boolean field "result"`);
      }

      const shouldContinue = mode === 'while' ? result === true : result === false;
      if (!shouldContinue) break;

      index++;
    }

    const text = items.join(joiner);
    const artifact = await this.workflows.createArtifact(runId, null, {
      kind: 'text',
      mimeType: 'text/plain',
      contentText: text,
    });

    await this.workflows.upsertNodeRun(runId, nodeId, {
      status: 'completed',
      finishedAt: new Date(),
      outputText: text,
      outputJson: null,
      primaryArtifactId: artifact.id,
      inputSnapshot: {
        sources: sourcesSorted,
        loop: { maxIterations, joiner, mode },
        note: 'workflow.loopStart',
      },
      error: null,
    });

    // Mark the structural loopEnd node as completed (it is never executed directly).
    await this.workflows.upsertNodeRun(runId, range.endId, {
      status: 'completed',
      startedAt,
      finishedAt: new Date(),
      outputText: '',
      outputJson: null,
      primaryArtifactId: null,
      inputSnapshot: { sources: [nodeId], note: 'workflow.loopEnd (structural)' },
      error: null,
    });

    ctx.nodes[nodeId] = text;
  }

  private async executeSingleNode(args: {
    runId: string;
    nodeId: string;
    node: WorkflowGraphNode;
    nodeById: Map<string, WorkflowGraphNode>;
    incoming: Map<string, IncomingEdge[]>;
    ctx: WorkflowRenderContext;
    iteration: number;
  }) {
    const { runId, nodeId, node, nodeById, incoming, ctx, iteration } = args;

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
    const rawPrompt = getString(node.prompt).trim();

    const loopLast =
      iteration > 0 && typeof ctx.loop?.last === 'string' && ctx.loop.last.trim().length > 0
        ? ctx.loop.last
        : null;

    const edgesInAll = (incoming.get(nodeId) ?? []).slice();
    const edgesIn = edgesInAll.filter((e) => {
      const srcNode = nodeById.get(e.source);
      const srcType = String(srcNode?.type ?? 'lmstudio.llm');
      if (srcType !== 'workflow.condition') return true;

      const condOut = ctx.nodes?.[e.source];
      if (typeof condOut !== 'boolean') {
        throw new Error(`Missing/invalid condition output for node ${e.source}`);
      }

      const port = String(e.sourcePort ?? COND_TRUE_PORT);
      if (condOut === true) return port === COND_TRUE_PORT;
      return port === COND_FALSE_PORT;
    });

    /**
     * Data-flow vs control-flow
     * -----------------------
     * We treat only "right -> left" edges as *data* inputs that should be automatically
     * appended/passed to the next node (without requiring {{input}} templating).
     * Condition branches (cond-true/cond-false) are control edges and should not become input.
     */
    const activeSourcesSorted = edgesIn
      .map((e) => e.source)
      .slice()
      .sort((a, b) => a.localeCompare(b));

    const dataEdges = edgesIn.filter(
      (e) =>
        String(e.sourcePort ?? '') === 'port-right' && String(e.targetPort ?? '') === 'port-left',
    );

    const sourcesSorted = dataEdges
      .map((e) => e.source)
      .slice()
      .sort((a, b) => a.localeCompare(b));

    // If this node has incoming edges, but none are active (inactive condition branch), skip execution.
    if (edgesInAll.length > 0 && activeSourcesSorted.length === 0) {
      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        startedAt: new Date(),
        finishedAt: new Date(),
        outputText: '',
        outputJson: null,
        primaryArtifactId: null,
        inputSnapshot: {
          sources: [],
          note: 'skipped (inactive condition branch)',
        },
        error: null,
      });
      ctx.nodes[nodeId] = '';
      return;
    }

    // Build automatic input from upstream *data* dependencies.
    // - single upstream: pass through raw value
    // - multiple upstream: append as text blocks in a deterministic order
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
      const assetId = getString(getPath(node, 'config', 'asset', 'assetId')).trim();
      if (!assetId) throw new Error(`workflow.asset missing config.asset.assetId (node ${nodeId})`);

      const asset = await this.assets.getById(assetId);
      const extract = getPath(node, 'config', 'asset', 'extract') === true;

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

      const out = {
        assetId,
        filename: asset.originalFilename,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        sha256: asset.sha256,
        // Tool-call compatible args for doc_read
        docRead: { assetId },
        // Optional derived content
        kind,
        extractedText,
        extractedJson,
        extractWarnings,
        extractStats,
      };

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
        const ai = this.portIndex(a.targetPort);
        const bi = this.portIndex(b.targetPort);
        if (ai !== null && bi !== null && ai !== bi) return ai - bi;
        if (ai !== null && bi === null) return -1;
        if (ai === null && bi !== null) return 1;
        return a.id.localeCompare(b.id);
      });

      const sources = edges.map((e) => e.source);
      const parts: string[] = [];
      for (const src of sources) {
        if (!(src in ctx.nodes))
          throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
        parts.push(this.toText(ctx.nodes[src]));
      }

      const sep = getString(getPath(node, 'config', 'merge', 'separator'), '\n\n');
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
        getString(getPath(node, 'config', 'export', 'filename')).trim() ||
        getString((node as unknown as Record<string, unknown>).exportFilename).trim() ||
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

    if (nodeType === 'workflow.tool') {
      const toolName = getString(getPath(node, 'config', 'tool', 'name')).trim();
      if (!toolName) throw new Error(`workflow.tool missing config.tool.name (node ${nodeId})`);

      const rawArgs = getPath(node, 'config', 'tool', 'args');

      // Allow template rendering in string fields inside args.
      ctx.__depsForRender = new Set(sourcesSorted);

      const isPlainObject = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null && !Array.isArray(v);

      const renderAny = (v: unknown): unknown => {
        if (typeof v === 'string') return renderTemplate(v, ctx);
        if (Array.isArray(v)) return v.map((x) => renderAny(x));
        if (isPlainObject(v)) {
          const out: Record<string, unknown> = {};
          for (const [k, vv] of Object.entries(v)) out[k] = renderAny(vv);
          return out;
        }
        return v;
      };

      const renderedArgs = renderAny(rawArgs);
      const toolArgs: Record<string, unknown> = isPlainObject(renderedArgs) ? renderedArgs : {};

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'running',
        startedAt: new Date(),
        inputSnapshot: {
          sources: sourcesSorted,
          toolName,
          toolArgs,
          note: 'workflow.tool',
        },
        error: null,
      });

      const { result, artifactId } = await this.toolOrchestrator.executeToolDirect({
        runId,
        toolName,
        toolArgs,
      });

      const outputText = this.toText(result);
      let primaryArtifactId: string | null = artifactId ? String(artifactId) : null;

      if (!primaryArtifactId) {
        // Persist the tool output for inspection in the UI.
        const artifact =
          typeof result === 'string'
            ? await this.workflows.createArtifact(runId, null, {
                kind: 'text',
                mimeType: 'text/plain',
                contentText: String(result),
              })
            : await this.workflows.createArtifact(runId, null, {
                kind: 'json',
                mimeType: 'application/json',
                contentJson: result,
              });
        primaryArtifactId = artifact.id;
      }

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        finishedAt: new Date(),
        outputText,
        outputJson: typeof result === 'string' ? null : result,
        primaryArtifactId,
        inputSnapshot: {
          sources: sourcesSorted,
          toolName,
          note: 'workflow.tool',
        },
        error: null,
      });

      ctx.nodes[nodeId] = result;
      return;
    }

    if (nodeType === 'workflow.condition') {
      const profileName = String(node.profileName ?? '').trim();
      if (!profileName) throw new Error(`Node ${nodeId} missing profileName`);
      if (!rawPrompt) throw new Error(`Node ${nodeId} missing prompt`);

      const profile = await this.settings.resolveProfile(this.ownerKey, profileName);
      if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

      const profileObj = asJsonObject(profile as unknown);
      const params: Record<string, unknown> = { ...asJsonObject(profileObj.params) };
      const modelKey = getString(params.modelKey).trim();
      if (!modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

      params.structuredOutput = {
        enabled: true,
        strict: true,
        name: 'workflow_condition',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { result: { type: 'boolean' } },
          required: ['result'],
        },
      };

      const systemPrompt = getString(profileObj.systemPrompt).trim();

      ctx.__depsForRender = new Set(sourcesSorted);
      let renderedPrompt = renderTemplate(rawPrompt, ctx);
      const blocks: string[] = [];
      if (loopLast) {
        blocks.push(
          `You are in a loop. The text below is the output from the previous iteration.\n` +
            `---\nLAST_ITERATION_OUTPUT:\n${loopLast}\n---\n`,
        );
      }
      if (sourcesSorted.length > 0) {
        const inputText = this.toText(ctx.input);
        blocks.push(
          `You are given upstream context from previous workflow steps.\n---\nUPSTREAM_INPUT:\n${inputText}\n---\n`,
        );
      }
      if (blocks.length) renderedPrompt = `${blocks.join('\n')}\n\n${renderedPrompt}`;

      const finalPrompt =
        `Decide whether the condition is satisfied.\n` +
        `Return ONLY a JSON object that matches this schema: {"result": true|false}.\n` +
        `Do not include any other keys, text, or explanation.\n\n` +
        renderedPrompt;

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'running',
        startedAt: new Date(),
        inputSnapshot: {
          sources: sourcesSorted,
          profileName,
          modelKey,
          note: 'workflow.condition',
        },
        error: null,
      });

      const gen = this.engine.streamChat(
        `${runId}:${nodeId}:${iteration}`,
        this.buildMessages(systemPrompt, finalPrompt),
        params,
      );

      let full = '';
      while (true) {
        const { value, done } = await gen.next();
        if (done) break;
        if (value?.delta) full += value.delta;
      }

      const parsed = safeJsonParse(full.trim());
      if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
        throw new Error(
          `Condition did not return valid JSON: ${parsed.ok ? 'invalid object' : parsed.error}`,
        );
      }

      const result = getPath(parsed.value, 'result');
      if (typeof result !== 'boolean')
        throw new Error(`Condition JSON missing boolean field "result"`);

      const artifact = await this.workflows.createArtifact(runId, null, {
        kind: 'json',
        mimeType: 'application/json',
        contentJson: { result },
      });

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        finishedAt: new Date(),
        outputText: String(result),
        outputJson: { result },
        primaryArtifactId: artifact.id,
        inputSnapshot: { sources: sourcesSorted, note: 'workflow.condition' },
        error: null,
      });

      ctx.nodes[nodeId] = result;
      return;
    }

    if (nodeType !== 'lmstudio.llm') {
      throw new Error(`Unsupported node type: ${nodeType}`);
    }

    const profileName = String(node.profileName ?? '').trim();
    if (!profileName) throw new Error(`Node ${nodeId} missing profileName`);
    if (!rawPrompt) throw new Error(`Node ${nodeId} missing prompt`);

    ctx.__depsForRender = new Set(sourcesSorted);
    let renderedPrompt = renderTemplate(rawPrompt, ctx);
    {
      const blocks: string[] = [];
      if (loopLast) {
        blocks.push(
          `You are in a loop. The text below is the output from the previous iteration.\n` +
            `---\nLAST_ITERATION_OUTPUT:\n${loopLast}\n---\n`,
        );
      }
      if (sourcesSorted.length > 0) {
        const inputText = this.toText(ctx.input);
        blocks.push(
          `You are given upstream context from previous workflow steps.\n---\nUPSTREAM_INPUT:\n${inputText}\n---\n`,
        );
      }
      if (blocks.length) renderedPrompt = `${blocks.join('\n')}\n\n${renderedPrompt}`;
    }

    const profile = await this.settings.resolveProfile(this.ownerKey, profileName);
    if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

    const profileObj = asJsonObject(profile as unknown);
    const params: Record<string, unknown> = { ...asJsonObject(profileObj.params) };
    const modelKey = getString(params.modelKey).trim();
    if (!modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

    const nodeStructured = getPath(node, 'config', 'llm', 'structuredOutput');
    const nodeStructuredObj = asJsonObject(nodeStructured);
    if (nodeStructuredObj.enabled === true) {
      params.structuredOutput = {
        enabled: true,
        strict: nodeStructuredObj.strict === false ? false : true,
        name: getString(nodeStructuredObj.name, 'node_structured_output'),
        schema: isJsonObject(nodeStructuredObj.schema)
          ? nodeStructuredObj.schema
          : { type: 'object' },
      };
    }

    const systemPrompt = getString(profileObj.systemPrompt).trim();

    await this.workflows.upsertNodeRun(runId, nodeId, {
      iteration,
      status: 'running',
      startedAt: new Date(),
      inputSnapshot: {
        sources: sourcesSorted,
        profileName,
        modelKey,
        note: 'lmstudio.llm',
      },
      error: null,
    });

    const streamId = `${runId}:${nodeId}:${iteration}`;
    const messages = this.buildMessages(systemPrompt, renderedPrompt);

    const toolsEnabled = this.parseToolsEnabled(getPath(params, 'toolsEnabled'));
    const structuredEnabled = getPath(params, 'structuredOutput', 'enabled') === true;

    // Tools + schema-enforced structured output are not reliably supported by many servers/models.
    // If tools are enabled, prefer tool calling and fall back to "soft JSON" parsing afterwards.
    const paramsForCall: Record<string, unknown> = { ...params };
    if (toolsEnabled && structuredEnabled) {
      delete paramsForCall.structuredOutput;
    }

    const useTools = toolsEnabled && !structuredEnabled;
    this.logger.log(
      `Workflow LLM node ${nodeId}: toolsEnabled=${toolsEnabled} structuredEnabled=${structuredEnabled} -> ${useTools ? 'ToolOrchestrator' : 'ChatEngine'}`,
    );

    const gen = useTools
      ? this.toolOrchestrator.streamWithTools(runId, messages, paramsForCall)
      : this.engine.streamChat(streamId, messages, paramsForCall);

    let full = '';
    while (true) {
      const { value, done } = await gen.next();
      if (done) break;
      if (value?.delta) full += value.delta;
    }

    const parsed = safeJsonParse(full.trim());
    if (parsed.ok) {
      const artifact = await this.workflows.createArtifact(runId, null, {
        kind: 'json',
        mimeType: 'application/json',
        contentJson: parsed.value,
      });

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        finishedAt: new Date(),
        outputText: null,
        outputJson: parsed.value,
        primaryArtifactId: artifact.id,
        inputSnapshot: { sources: sourcesSorted, note: 'lmstudio.llm (json)' },
        error: null,
      });

      ctx.nodes[nodeId] = parsed.value;
    } else {
      const artifact = await this.workflows.createArtifact(runId, null, {
        kind: 'text',
        mimeType: 'text/plain',
        contentText: full,
      });

      await this.workflows.upsertNodeRun(runId, nodeId, {
        iteration,
        status: 'completed',
        finishedAt: new Date(),
        outputText: full,
        outputJson: null,
        primaryArtifactId: artifact.id,
        inputSnapshot: { sources: sourcesSorted, note: 'lmstudio.llm (text)' },
        error: null,
      });

      ctx.nodes[nodeId] = full;
    }
  }
}
