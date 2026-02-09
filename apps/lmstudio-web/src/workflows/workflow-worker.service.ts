/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { SettingsService } from '../settings/settings.service';
import { ChatEngineService } from '../chats/chat-engine.service';
import type { LmMessage } from '../common/types/llm.types';

type Graph = {
  nodes?: any[];
  edges?: Array<{
    id?: string;
    source?: string;
    target?: string;
    sourcePort?: string;
    targetPort?: string;
    [key: string]: any;
  }>;
};

type Edge = {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
};

type IncomingEdge = Edge;

const COND_TRUE_PORT = 'cond-true';
const COND_FALSE_PORT = 'cond-false';

const LOOP_START = 'workflow.loopStart';
const LOOP_END = 'workflow.loopEnd';

type LoopMode = 'while' | 'until';

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
    private readonly settings: SettingsService,
    private readonly engine: ChatEngineService,
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
    } catch (err: any) {
      this.logger.error(err?.message ?? String(err));
    } finally {
      this.isTickRunning = false;
    }
  }

  // ----------------------------
  // Graph normalization (v2 + legacy)
  // ----------------------------

  private normalizeEdges(graph: Graph, nodeIds: Set<string>): Edge[] {
    const raw = Array.isArray(graph.edges) ? graph.edges : [];
    const out: Edge[] = [];

    for (const e of raw) {
      const source = String(e?.source ?? '').trim();
      const target = String(e?.target ?? '').trim();
      if (!source || !target) continue;
      if (source === target) continue;
      if (!nodeIds.has(source) || !nodeIds.has(target)) continue;

      out.push({
        id: String(e?.id ?? `${source}->${target}`),
        source,
        target,
        sourcePort: e?.sourcePort ? String(e.sourcePort) : undefined,
        targetPort: e?.targetPort ? String(e.targetPort) : undefined,
      });
    }

    // dedupe + stable
    const seen = new Set<string>();
    const deduped: Edge[] = [];
    for (const e of out) {
      const k = `${e.source}->${e.target}|${e.sourcePort ?? ''}|${e.targetPort ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(e);
    }

    return deduped.sort((a, b) => a.id.localeCompare(b.id));
  }

  private deriveEdgesFromLegacyInputFrom(nodes: any[], nodeIds: Set<string>): Edge[] {
    const out: Edge[] = [];
    for (const n of nodes) {
      const target = String(n?.id ?? '').trim();
      const source = typeof n?.inputFrom === 'string' ? n.inputFrom.trim() : '';
      if (!source || !target) continue;
      if (source === target) continue;
      if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
      out.push({
        id: `${source}->${target}`,
        source,
        target,
        sourcePort: 'port-right',
        targetPort: 'port-left',
      });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  private getNormalizedGraph(graph: Graph) {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const ids = nodes.map((n) => String(n?.id ?? '')).filter(Boolean);
    const nodeIds = new Set(ids);

    const edges = this.normalizeEdges(graph, nodeIds);
    const finalEdges = edges.length ? edges : this.deriveEdgesFromLegacyInputFrom(nodes, nodeIds);

    return { nodes, ids, nodeIds, edges: finalEdges };
  }

  // ----------------------------
  // Dependency detection
  // ----------------------------

  private extractNodeRefs(prompt: string): string[] {
    // supports {{nodes.X}} and {{steps.X}} (+ optional .path)
    const txt = String(prompt ?? '');
    const out: string[] = [];

    const rx = /\{\{\s*(?:nodes|steps)\.([a-zA-Z0-9_-]+)(?:\.[^}]+)?\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(txt))) out.push(m[1]);

    return out;
  }

  private buildDependencies(graph: Graph) {
    const { nodes, ids, nodeIds, edges } = this.getNormalizedGraph(graph);

    const incoming = new Map<string, IncomingEdge[]>();
    for (const e of edges) {
      if (!incoming.has(e.target)) incoming.set(e.target, []);
      incoming.get(e.target)!.push(e);
    }
    for (const [k, arr] of incoming) arr.sort((a, b) => a.id.localeCompare(b.id));

    const nodeById = new Map<string, any>();
    for (const n of nodes) if (n?.id) nodeById.set(String(n.id), n);

    const deps = new Map<string, Set<string>>();
    for (const id of ids) deps.set(id, new Set());

    for (const id of ids) {
      const n = nodeById.get(id);
      if (!n) continue;

      const prompt = String(n.prompt ?? '');

      for (const e of incoming.get(id) ?? []) {
        const src = e.source;
        if (nodeIds.has(src) && src !== id) deps.get(id)!.add(src);
      }

      for (const ref of this.extractNodeRefs(prompt)) {
        if (nodeIds.has(ref) && ref !== id) deps.get(id)!.add(ref);
      }
    }

    return { ids, nodeById, deps, incoming };
  }

  /**
   * Topological order derived from computed deps.
   * - If cycle/missing -> fall back to declared node order.
   */
  private topoSort(graph: Graph): string[] {
    const { ids, deps } = this.buildDependencies(graph);

    const indeg = new Map<string, number>();
    const adj = new Map<string, Set<string>>();

    for (const id of ids) indeg.set(id, 0);

    for (const [to, fromSet] of deps) {
      for (const from of fromSet) {
        indeg.set(to, (indeg.get(to) ?? 0) + 1);
        if (!adj.has(from)) adj.set(from, new Set());
        adj.get(from)!.add(to);
      }
    }

    const q: string[] = [];
    for (const [id, d] of indeg) if (d === 0) q.push(id);
    q.sort((a, b) => a.localeCompare(b));

    const out: string[] = [];
    while (q.length) {
      const cur = q.shift()!;
      out.push(cur);
      for (const nx of adj.get(cur) ?? []) {
        indeg.set(nx, (indeg.get(nx) ?? 0) - 1);
        if (indeg.get(nx) === 0) {
          q.push(nx);
          q.sort((a, b) => a.localeCompare(b));
        }
      }
    }

    if (out.length !== ids.length) return ids;
    return out;
  }

  // ----------------------------
  // Templating and execution
  // ----------------------------

  private renderTemplate(input: string, ctx: any): string {
    const alias = input.replace(/\{\{\s*steps\./g, '{{nodes.');

    // Loop helpers
    const loopIndex = Number.isFinite(Number(ctx?.loop?.index)) ? Number(ctx.loop.index) : null;
    const loopIteration = Number.isFinite(Number(ctx?.loop?.iteration))
      ? Number(ctx.loop.iteration)
      : loopIndex !== null
        ? loopIndex + 1
        : null;

    const withLoopVars = alias
      .replace(/\{\{\s*(?:loop\.)?index\s*\}\}/g, () =>
        loopIndex === null ? '' : String(loopIndex),
      )
      .replace(/\{\{\s*(?:loop\.)?iteration\s*\}\}/g, () =>
        loopIteration === null ? '' : String(loopIteration),
      );

    const withInput = withLoopVars.replace(
      /\{\{\s*input(?:\.([a-zA-Z0-9_$. -]+))?\s*\}\}/g,
      (_m, rest) => {
        const base = ctx?.input;
        if (base === undefined || base === null) return '';
        if (!rest) return typeof base === 'string' ? base : JSON.stringify(base);
        const parts = String(rest)
          .split('.')
          .map((s) => s.trim())
          .filter(Boolean);
        let cur: any = base;
        for (const p of parts) {
          if (!cur || typeof cur !== 'object') return '';
          cur = cur[p];
        }
        if (cur === undefined || cur === null) return '';
        if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean')
          return String(cur);
        return JSON.stringify(cur);
      },
    );

    return withInput.replace(
      /\{\{\s*nodes\.([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9_$. -]+))?\s*\}\}/g,
      (_m, nodeId, rest) => {
        const base = ctx?.nodes?.[nodeId];
        if (!base) return '';
        if (!rest) return typeof base === 'string' ? base : JSON.stringify(base);
        const parts = String(rest)
          .split('.')
          .map((s) => s.trim())
          .filter(Boolean);
        let cur: any = base;
        for (const p of parts) {
          if (!cur || typeof cur !== 'object') return '';
          cur = cur[p];
        }
        if (cur === undefined || cur === null) return '';
        if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean')
          return String(cur);
        return JSON.stringify(cur);
      },
    );
  }

  private safeJsonParse(text: string) {
    try {
      return { ok: true as const, value: JSON.parse(text) };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ? String(e.message) : 'Invalid JSON' };
    }
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

  private toText(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  }

  private async executeSingleNode(args: {
    runId: string;
    nodeId: string;
    node: any;
    nodeById: Map<string, any>;
    incoming: Map<string, IncomingEdge[]>;
    ctx: any;
    iteration: number;
  }) {
    const { runId, nodeId, node, nodeById, incoming, ctx, iteration } = args;

    const existing = (await this.workflows.getRun(this.ownerKey, runId)).nodeRuns.find(
      (r: any) => r.nodeId === nodeId && Number(r.iteration ?? 0) === iteration,
    );
    if (existing && existing.status === 'completed') return;

    await this.workflows.setCurrentNode(runId, nodeId);

    const nodeType = String(node.type ?? 'lmstudio.llm');
    const rawPrompt = String(node.prompt ?? '').trim();

    const loopLast =
      iteration > 0 && typeof ctx?.loop?.last === 'string' && ctx.loop.last.trim().length > 0
        ? String(ctx.loop.last)
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

    const sourcesSorted = edgesIn
      .map((e) => e.source)
      .slice()
      .sort((a, b) => a.localeCompare(b));

    if (edgesInAll.length > 0 && sourcesSorted.length === 0) {
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

    if (sourcesSorted.length === 1) {
      const src = sourcesSorted[0];
      if (!(src in ctx.nodes))
        throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
      ctx.input = ctx.nodes[src];
    } else if (sourcesSorted.length > 1) {
      const obj: Record<string, any> = {};
      for (const src of sourcesSorted) {
        if (!(src in ctx.nodes))
          throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
        obj[src] = ctx.nodes[src];
      }
      ctx.input = obj;
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

      const sep = (node?.config?.merge?.separator ?? '\n\n') as string;
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
      const filename = (node?.config?.export?.filename ??
        node?.exportFilename ??
        `export-${runId}-${nodeId}.txt`) as string;

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

    if (nodeType === 'workflow.condition') {
      const profileName = String(node.profileName ?? '').trim();
      if (!profileName) throw new Error(`Node ${nodeId} missing profileName`);
      if (!rawPrompt) throw new Error(`Node ${nodeId} missing prompt`);

      const profile = await this.settings.getByName(this.ownerKey, profileName);
      if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

      const params: any = { ...(profile.params ?? {}) };
      if (!params.modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

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

      const systemPrompt = String((profile as any).systemPrompt ?? '').trim();

      let renderedPrompt = this.renderTemplate(rawPrompt, ctx);
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
          modelKey: params.modelKey,
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

      const parsed = this.safeJsonParse(full.trim());
      if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
        throw new Error(
          `Condition did not return valid JSON: ${parsed.ok ? 'invalid object' : parsed.error}`,
        );
      }

      const result = (parsed.value as any).result;
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

    let renderedPrompt = this.renderTemplate(rawPrompt, ctx);
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

    const profile = await this.settings.getByName(this.ownerKey, profileName);
    if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

    const params = (profile.params ?? {}) as any;
    if (!params.modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

    const systemPrompt = String((profile as any).systemPrompt ?? '').trim();

    await this.workflows.upsertNodeRun(runId, nodeId, {
      iteration,
      status: 'running',
      startedAt: new Date(),
      inputSnapshot: {
        sources: sourcesSorted,
        profileName,
        modelKey: params.modelKey,
        note: 'lmstudio.llm',
      },
      error: null,
    });

    const gen = this.engine.streamChat(
      `${runId}:${nodeId}:${iteration}`,
      this.buildMessages(systemPrompt, renderedPrompt),
      params,
    );

    let full = '';
    while (true) {
      const { value, done } = await gen.next();
      if (done) break;
      if (value?.delta) full += value.delta;
    }

    const parsed = this.safeJsonParse(full.trim());
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

  private async executeRun(runId: string, workflowId: string) {
    try {
      const wf = await this.workflows.get(this.ownerKey, workflowId);
      const graph: Graph = wf.graph ?? {};

      const nodeOrder = this.topoSort(graph);
      const { nodeById, incoming } = this.buildDependencies(graph);

      // Pre-compute loop ranges (loop body = everything between loopStart and the next loopEnd in topo order).
      const loopRanges = new Map<
        string,
        { startIdx: number; endIdx: number; body: string[]; endId: string }
      >();
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
        loopRanges.set(id, { startIdx: i, endIdx, body, endId });
        for (const b of body) loopBodyIds.add(b);
        loopBodyIds.add(endId);

        i = endIdx; // skip scanning inside the loop body
      }

      const ctx: any = { nodes: {}, input: null, loop: null };

      // Restore context from already completed node runs (rerun-from support).
      // For nodes with multiple iterations (loops), we keep the latest iteration output.
      const details = await this.workflows.getRun(this.ownerKey, runId);
      const latestByNode = new Map<string, any>();
      const bestKey = new Map<string, { iteration: number; createdAt: string }>();

      for (const nr of details.nodeRuns) {
        if (nr.status !== 'completed') continue;
        const it = Number.isFinite(Number((nr as any).iteration))
          ? Number((nr as any).iteration)
          : 0;
        const createdAt = String((nr as any).createdAt ?? '');
        const prev = bestKey.get(nr.nodeId);
        if (!prev || it > prev.iteration || (it === prev.iteration && createdAt > prev.createdAt)) {
          bestKey.set(nr.nodeId, { iteration: it, createdAt });
          if (nr.outputJson !== null && nr.outputJson !== undefined)
            latestByNode.set(nr.nodeId, nr.outputJson);
          else if (nr.outputText !== null && nr.outputText !== undefined)
            latestByNode.set(nr.nodeId, nr.outputText);
        }
      }
      for (const [k, v] of latestByNode) ctx.nodes[k] = v;

      for (const nodeId of nodeOrder) {
        const node = nodeById.get(nodeId);
        if (!node) continue;

        const existing = (await this.workflows.getRun(this.ownerKey, runId)).nodeRuns.find(
          (r) => r.nodeId === nodeId,
        );
        if (existing && existing.status === 'completed') continue;

        await this.workflows.setCurrentNode(runId, nodeId);

        const nodeType = String(node.type ?? 'lmstudio.llm');

        // Loop bodies are executed by their corresponding loopStart node.
        if (nodeType === LOOP_END) continue;
        if (nodeType !== LOOP_START && loopBodyIds.has(nodeId)) continue;

        const rawPrompt = String(node.prompt ?? '').trim();

        const edgesInAll = (incoming.get(nodeId) ?? []).slice();

        /**
         * Determine "active" incoming edges for this node.
         *
         * For condition branches, only the selected branch edge is considered active:
         * - sourcePort === COND_TRUE_PORT  -> active when condition output is true
         * - sourcePort === COND_FALSE_PORT -> active when condition output is false
         *
         * Edges without a sourcePort from condition nodes are treated as true-branch for backward compatibility.
         */
        const edgesIn = edgesInAll.filter((e) => {
          const srcNode = nodeById.get(e.source);
          const srcType = String(srcNode?.type ?? 'lmstudio.llm');
          if (srcType !== 'workflow.condition') return true;

          const condOut = ctx.nodes?.[e.source];
          if (typeof condOut !== 'boolean') {
            // Condition outputs must be boolean for branching.
            throw new Error(`Missing/invalid condition output for node ${e.source}`);
          }

          const port = String(e.sourcePort ?? COND_TRUE_PORT);
          if (condOut === true) return port === COND_TRUE_PORT;
          return port === COND_FALSE_PORT;
        });

        // default upstream resolution: sorted by source id
        const sourcesSorted = edgesIn
          .map((e) => e.source)
          .slice()
          .sort((a, b) => a.localeCompare(b));

        // If this node has incoming edges, but none are active (inactive branch), skip execution.
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
          continue;
        }

        if (sourcesSorted.length === 1) {
          const src = sourcesSorted[0];
          if (!(src in ctx.nodes)) {
            throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
          }
          ctx.input = ctx.nodes[src];
        } else if (sourcesSorted.length > 1) {
          const obj: Record<string, any> = {};
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

        // ----------------------------
        // LoopStart/LoopEnd (structural loop)
        // ----------------------------
        if (nodeType === LOOP_START) {
          const range = loopRanges.get(nodeId);
          if (!range) throw new Error(`LoopStart ${nodeId} has no range metadata`);

          const loopCfg = node?.config?.loop ?? {};
          const maxIterations = Math.max(1, Math.min(1000, Number(loopCfg.maxIterations ?? 10)));
          const joiner = String(loopCfg.joiner ?? '\n\n');
          const mode = String(loopCfg.mode ?? 'until') as LoopMode;
          const conditionPrompt = String(loopCfg.conditionPrompt ?? '').trim();

          if (mode !== 'while' && mode !== 'until') {
            throw new Error(`LoopStart ${nodeId} has invalid mode: ${String(loopCfg.mode)}`);
          }
          if (!conditionPrompt) throw new Error(`LoopStart ${nodeId} missing loop.conditionPrompt`);

          const profileName = String(node.profileName ?? '').trim();
          if (!profileName) throw new Error(`LoopStart ${nodeId} missing profileName`);

          const profile = await this.settings.getByName(this.ownerKey, profileName);
          if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

          const params: any = { ...(profile.params ?? {}) };
          if (!params.modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

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

          const systemPrompt = String((profile as any).systemPrompt ?? '').trim();

          // Make the upstream input available under {{input}} for the first iteration if needed.
          ctx.nodes[nodeId] = ctx.input;

          const items: string[] = [];
          const startedAt = new Date();

          await this.workflows.upsertNodeRun(runId, nodeId, {
            status: 'running',
            startedAt,
            inputSnapshot: {
              sources: sourcesSorted,
              profileName,
              modelKey: params.modelKey,
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

            // Execute loop body for this iteration.
            for (const bodyNodeId of range.body) {
              const bodyNode = nodeById.get(bodyNodeId);
              if (!bodyNode) continue;
              const bodyType = String(bodyNode.type ?? 'lmstudio.llm');
              if (bodyType === LOOP_START || bodyType === LOOP_END) {
                throw new Error(
                  `Nested loops are not supported yet (found ${bodyType} inside loop body)`,
                );
              }

              // Reuse the normal execution path by temporarily setting current node.
              // We do this by running the same code through a small helper.
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

            const renderedCond = this.renderTemplate(conditionPrompt, {
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

            const parsed = this.safeJsonParse(full.trim());
            if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
              throw new Error(
                `Loop condition did not return valid JSON: ${parsed.ok ? 'invalid object' : parsed.error}`,
              );
            }
            const result = (parsed.value as any).result;
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
              conditionPrompt,
              note: 'workflow.loopStart',
            },
            error: null,
          });

          ctx.nodes[nodeId] = text;

          // LoopEnd is a structural marker but also acts as the output anchor for downstream edges.
          ctx.nodes[range.endId] = text;
          await this.workflows.upsertNodeRun(runId, range.endId, {
            status: 'completed',
            startedAt: new Date(),
            finishedAt: new Date(),
            outputText: text,
            outputJson: null,
            primaryArtifactId: artifact.id,
            inputSnapshot: { sources: [nodeId], note: 'workflow.loopEnd (pass-through)' },
            error: null,
          });

          ctx.loop = null;
          continue;
        }

        // ----------------------------
        // UI preview node (no-op-ish, but allowed in runs)
        // ----------------------------
        if (nodeType === 'ui.preview') {
          const text = this.toText(ctx.input);

          const artifact = await this.workflows.createArtifact(runId, null, {
            kind: 'text',
            mimeType: 'text/plain',
            contentText: text,
          });

          await this.workflows.upsertNodeRun(runId, nodeId, {
            status: 'completed',
            startedAt: new Date(),
            finishedAt: new Date(),
            outputText: text,
            outputJson: null,
            primaryArtifactId: artifact.id,
            inputSnapshot: {
              sources: sourcesSorted,
              note: 'ui.preview pass-through',
            },
            error: null,
          });

          ctx.nodes[nodeId] = text;
          continue;
        }

        // ----------------------------
        // Merge node (ordered concatenation by targetPort in-1..in-n)
        // ----------------------------
        if (nodeType === 'workflow.merge') {
          // Sort sources by targetPort index, then id.
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
          if (sources.length === 0) {
            await this.workflows.upsertNodeRun(runId, nodeId, {
              status: 'completed',
              startedAt: new Date(),
              finishedAt: new Date(),
              outputText: '',
              outputJson: null,
              primaryArtifactId: null,
              inputSnapshot: { sources: [], note: 'workflow.merge (no inputs)' },
              error: null,
            });
            ctx.nodes[nodeId] = '';
            continue;
          }

          const parts: string[] = [];
          for (const src of sources) {
            if (!(src in ctx.nodes))
              throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
            parts.push(this.toText(ctx.nodes[src]));
          }

          const sep = (node?.config?.merge?.separator ?? '\n\n') as string;
          const text = parts.join(String(sep));

          const artifact = await this.workflows.createArtifact(runId, null, {
            kind: 'text',
            mimeType: 'text/plain',
            contentText: text,
          });

          await this.workflows.upsertNodeRun(runId, nodeId, {
            status: 'completed',
            startedAt: new Date(),
            finishedAt: new Date(),
            outputText: text,
            outputJson: null,
            primaryArtifactId: artifact.id,
            inputSnapshot: {
              sources,
              separator: String(sep),
              note: 'workflow.merge',
            },
            error: null,
          });

          ctx.nodes[nodeId] = text;
          continue;
        }

        // ----------------------------
        // Export node (creates an artifact download)
        // ----------------------------
        if (nodeType === 'workflow.export') {
          if (sourcesSorted.length !== 1) {
            throw new Error(
              `workflow.export requires exactly 1 input (got ${sourcesSorted.length})`,
            );
          }

          const src = sourcesSorted[0];
          if (!(src in ctx.nodes))
            throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);

          const text = this.toText(ctx.nodes[src]);

          const filename = (node?.config?.export?.filename ??
            node?.exportFilename ??
            `export-${runId}-${nodeId}.txt`) as string;

          const artifact = await this.workflows.createArtifact(runId, null, {
            kind: 'text',
            mimeType: 'text/plain',
            filename: String(filename),
            contentText: text,
          });

          await this.workflows.upsertNodeRun(runId, nodeId, {
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

          // Export can also be used as a pass-through output for downstream steps.
          ctx.nodes[nodeId] = text;
          continue;
        }

        // ----------------------------
        // Condition node (boolean, branch selector)
        // ----------------------------
        if (nodeType === 'workflow.condition') {
          const profileName = String(node.profileName ?? '').trim();
          if (!profileName) throw new Error(`Node ${nodeId} missing profileName`);
          if (!rawPrompt) throw new Error(`Node ${nodeId} missing prompt`);

          const profile = await this.settings.getByName(this.ownerKey, profileName);
          if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

          const params: any = { ...(profile.params ?? {}) };
          if (!params.modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

          // Enforce a strict boolean result via JSON schema.
          params.structuredOutput = {
            enabled: true,
            strict: true,
            name: 'workflow_condition',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                result: { type: 'boolean' },
              },
              required: ['result'],
            },
          };

          const systemPrompt = String((profile as any).systemPrompt ?? '').trim();

          // Render prompt after ctx.input is set.
          let renderedPrompt = this.renderTemplate(rawPrompt, ctx);

          if (sourcesSorted.length > 0) {
            const inputText = this.toText(ctx.input);
            renderedPrompt =
              `You are given upstream context from previous workflow steps.\n` +
              `---\nUPSTREAM_INPUT:\n${inputText}\n---\n\n` +
              renderedPrompt;
          }

          const finalPrompt =
            `Decide whether the condition is satisfied.\n` +
            `Return ONLY a JSON object that matches this schema: {"result": true|false}.\n` +
            `Do not include any other keys, text, or explanation.\n\n` +
            renderedPrompt;

          await this.workflows.upsertNodeRun(runId, nodeId, {
            status: 'running',
            startedAt: new Date(),
            inputSnapshot: {
              sources: sourcesSorted,
              profileName,
              modelKey: params.modelKey,
              note: 'workflow.condition',
            },
            error: null,
          });

          const gen = this.engine.streamChat(
            `${runId}:${nodeId}`,
            this.buildMessages(systemPrompt, finalPrompt),
            params,
          );

          let full = '';
          while (true) {
            const { value, done } = await gen.next();
            if (done) break;
            if (value?.delta) full += value.delta;
          }

          const parsed = this.safeJsonParse(full.trim());
          if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
            await this.workflows.upsertNodeRun(runId, nodeId, {
              status: 'failed',
              finishedAt: new Date(),
              error: `Condition did not return valid JSON: ${parsed.ok ? 'invalid object' : parsed.error}`,
            });
            throw new Error(`Condition node ${nodeId} did not return valid JSON`);
          }

          const result = parsed.value.result;
          if (typeof result !== 'boolean') {
            await this.workflows.upsertNodeRun(runId, nodeId, {
              status: 'failed',
              finishedAt: new Date(),
              error: `Condition JSON missing boolean field "result"`,
            });
            throw new Error(`Condition node ${nodeId} missing boolean result`);
          }

          const artifact = await this.workflows.createArtifact(runId, null, {
            kind: 'json',
            mimeType: 'application/json',
            contentJson: { result },
          });

          await this.workflows.upsertNodeRun(runId, nodeId, {
            status: 'completed',
            finishedAt: new Date(),
            outputText: String(result),
            outputJson: { result },
            primaryArtifactId: artifact.id,
            inputSnapshot: {
              sources: sourcesSorted,
              note: 'workflow.condition',
            },
            error: null,
          });

          ctx.nodes[nodeId] = result;
          continue;
        }

        // ----------------------------
        // Existing pass-through nodes
        // ----------------------------
        if (nodeType === 'workflow.loop') {
          const text = this.toText(ctx.input);

          const artifact = await this.workflows.createArtifact(runId, null, {
            kind: 'text',
            mimeType: 'text/plain',
            contentText: text,
          });

          await this.workflows.upsertNodeRun(runId, nodeId, {
            status: 'completed',
            startedAt: new Date(),
            finishedAt: new Date(),
            outputText: text,
            outputJson: null,
            primaryArtifactId: artifact.id,
            inputSnapshot: {
              sources: sourcesSorted,
              note: 'pass-through v2',
            },
            error: null,
          });

          ctx.nodes[nodeId] = text;
          continue;
        }

        // ----------------------------
        // LLM nodes
        // ----------------------------

        if (nodeType !== 'lmstudio.llm') {
          await this.workflows.upsertNodeRun(runId, nodeId, {
            status: 'failed',
            error: `Unsupported node type: ${nodeType}`,
            finishedAt: new Date(),
          });
          throw new Error(`Unsupported node type: ${nodeType}`);
        }

        const profileName = String(node.profileName ?? '').trim();
        if (!profileName) throw new Error(`Node ${nodeId} missing profileName`);
        if (!rawPrompt) throw new Error(`Node ${nodeId} missing prompt`);

        // Render prompt after ctx.input is set.
        let renderedPrompt = this.renderTemplate(rawPrompt, ctx);

        if (sourcesSorted.length > 0) {
          const inputText = this.toText(ctx.input);
          renderedPrompt =
            `You are given upstream context from previous workflow steps.\n` +
            `---\nUPSTREAM_INPUT:\n${inputText}\n---\n\n` +
            renderedPrompt;
        }

        const profile = await this.settings.getByName(this.ownerKey, profileName);
        if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

        const params = (profile.params ?? {}) as any;
        if (!params.modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

        const systemPrompt = String((profile as any).systemPrompt ?? '').trim();

        await this.workflows.upsertNodeRun(runId, nodeId, {
          status: 'running',
          startedAt: new Date(),
          inputSnapshot: {
            sources: sourcesSorted,
            profileName,
            modelKey: params.modelKey,
            note: 'lmstudio.llm',
          },
          error: null,
        });

        const gen = this.engine.streamChat(
          `${runId}:${nodeId}`,
          this.buildMessages(systemPrompt, renderedPrompt),
          params,
        );

        let full = '';
        while (true) {
          const { value, done } = await gen.next();
          if (done) break;
          if (value?.delta) full += value.delta;
        }

        const parsed = this.safeJsonParse(full.trim());
        if (parsed.ok) {
          const artifact = await this.workflows.createArtifact(runId, null, {
            kind: 'json',
            mimeType: 'application/json',
            contentJson: parsed.value,
          });

          await this.workflows.upsertNodeRun(runId, nodeId, {
            status: 'completed',
            finishedAt: new Date(),
            outputText: null,
            outputJson: parsed.value,
            primaryArtifactId: artifact.id,
            inputSnapshot: {
              sources: sourcesSorted,
              note: 'lmstudio.llm (json)',
            },
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
            status: 'completed',
            finishedAt: new Date(),
            outputText: full,
            outputJson: null,
            primaryArtifactId: artifact.id,
            inputSnapshot: {
              sources: sourcesSorted,
              note: 'lmstudio.llm (text)',
            },
            error: null,
          });

          ctx.nodes[nodeId] = full;
        }
      }

      await this.workflows.markRunCompleted(runId);
    } catch (err: any) {
      await this.workflows.markRunFailed(runId, err?.message ?? String(err));
      throw err;
    }
  }
}
