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
  edges?: Array<{ id?: string; source?: string; target?: string }>;
};

type Edge = { id: string; source: string; target: string };

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
      out.push({ id: `${source}->${target}`, source, target });
    }

    // dedupe + stable
    const seen = new Set<string>();
    const deduped: Edge[] = [];
    for (const e of out) {
      const k = `${e.source}->${e.target}`;
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
      out.push({ id: `${source}->${target}`, source, target });
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

    const incoming = new Map<string, string[]>();
    for (const e of edges) {
      if (!incoming.has(e.target)) incoming.set(e.target, []);
      incoming.get(e.target)!.push(e.source);
    }
    for (const [k, arr] of incoming) arr.sort((a, b) => a.localeCompare(b));

    const nodeById = new Map<string, any>();
    for (const n of nodes) if (n?.id) nodeById.set(String(n.id), n);

    const deps = new Map<string, Set<string>>();
    for (const id of ids) deps.set(id, new Set());

    for (const id of ids) {
      const n = nodeById.get(id);
      if (!n) continue;

      const nodeType = String(n.type ?? 'lmstudio.llm');
      const prompt = String(n.prompt ?? '');

      // Edge dependencies
      const needsEdgeInput = nodeType === 'workflow.condition' || nodeType === 'workflow.loop';

      for (const src of incoming.get(id) ?? []) {
        if (nodeIds.has(src) && src !== id) deps.get(id)!.add(src);
      }

      // Template references always create deps
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

    const withInput = alias.replace(
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

  private async executeRun(runId: string, workflowId: string) {
    try {
      const wf = await this.workflows.get(this.ownerKey, workflowId);
      const graph: Graph = wf.graph ?? {};

      const nodeOrder = this.topoSort(graph);
      const { nodeById, incoming } = this.buildDependencies(graph);

      // Context of resolved outputs for templating
      // ctx.input is computed per-node from incoming edges
      const ctx: any = { nodes: {}, input: null };

      // Rehydrate already-completed node runs (resume support)
      const details = await this.workflows.getRun(this.ownerKey, runId);
      for (const nr of details.nodeRuns) {
        if (nr.status === 'completed') {
          if (nr.outputJson !== null && nr.outputJson !== undefined)
            ctx.nodes[nr.nodeId] = nr.outputJson;
          else if (nr.outputText) ctx.nodes[nr.nodeId] = nr.outputText;
        }
      }

      for (const nodeId of nodeOrder) {
        const node = nodeById.get(nodeId);
        if (!node) continue;

        // Skip if already completed
        const existing = (await this.workflows.getRun(this.ownerKey, runId)).nodeRuns.find(
          (r) => r.nodeId === nodeId,
        );
        if (existing && existing.status === 'completed') continue;

        await this.workflows.setCurrentNode(runId, nodeId);

        const nodeType = String(node.type ?? 'lmstudio.llm');

        // Build input from ALL incoming edges (only if prompt/type needs it)
        const rawPrompt = String(node.prompt ?? '').trim();
        const needsInput = nodeType === 'workflow.condition' || nodeType === 'workflow.loop';

        const sources = (incoming.get(nodeId) ?? []).slice().sort((a, b) => a.localeCompare(b));

        // ctx.input aus ALLEN Sources bauen (1 source -> value, mehrere -> object keyed by nodeId)
        if (sources.length === 1) {
          const src = sources[0];
          if (!(src in ctx.nodes)) {
            throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
          }
          ctx.input = ctx.nodes[src];
        } else if (sources.length > 1) {
          const obj: Record<string, any> = {};
          for (const src of sources) {
            if (!(src in ctx.nodes)) {
              throw new Error(`Missing upstream output: ${src} required by ${nodeId}`);
            }
            obj[src] = ctx.nodes[src];
          }
          ctx.input = obj;
        } else {
          ctx.input = null;
        }

        // Prompt rendern
        let renderedPrompt = this.renderTemplate(rawPrompt, ctx);

        // AUTOMATISCHE Input-Injection, sobald es Sources gibt,
        // aber nur wenn der User nicht explizit {{input}} verwendet (sonst doppelt)
        if (sources.length > 0 && !this.promptNeedsInput(rawPrompt)) {
          const inputText =
            ctx.input === null || ctx.input === undefined
              ? ''
              : typeof ctx.input === 'string'
                ? ctx.input
                : JSON.stringify(ctx.input, null, 2);

          renderedPrompt =
            `You are given upstream context from previous workflow steps.\n` +
            `---\nUPSTREAM_INPUT:\n${inputText}\n---\n\n` +
            renderedPrompt;
        }

        // Execute by node type
        if (nodeType === 'workflow.condition' || nodeType === 'workflow.loop') {
          // still pass-through for now
          const content = ctx.input;
          const text =
            content === null || content === undefined
              ? ''
              : typeof content === 'string'
                ? content
                : JSON.stringify(content);

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
              needsInput,
              note: 'pass-through v2',
            },
            error: null,
          });

          ctx.nodes[nodeId] = text;
          continue;
        }

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

        const profile = await this.settings.getByName(this.ownerKey, profileName);
        if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

        const params = (profile.params ?? {}) as Record<string, any>;
        if (!params.modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

        const systemPrompt = String(
          (profile as any).systemPrompt ?? (params as any).systemPrompt ?? '',
        ).trim();

        const nodeRun = await this.workflows.upsertNodeRun(runId, nodeId, {
          status: 'running',
          startedAt: new Date(),
          inputSnapshot: {
            profileId: profile.id,
            profileName,
            modelKey: params.modelKey,
            params,
            sources,
            needsInput,
            prompt: renderedPrompt,
          },
          error: null,
        });

        let full = '';
        const gen = this.engine.streamChat(
          runId + ':' + nodeId,
          this.buildMessages(systemPrompt, renderedPrompt),
          params,
        );

        while (true) {
          const { value, done } = await gen.next();
          if (done) {
            const parsed = this.safeJsonParse(full.trim());
            if (parsed.ok) {
              const artifact = await this.workflows.createArtifact(runId, nodeRun.id, {
                kind: 'json',
                mimeType: 'application/json',
                contentJson: parsed.value,
              });
              await this.workflows.upsertNodeRun(runId, nodeId, {
                status: 'completed',
                finishedAt: new Date(),
                outputText: full,
                outputJson: parsed.value,
                primaryArtifactId: artifact.id,
              });
              ctx.nodes[nodeId] = parsed.value;
            } else {
              const artifact = await this.workflows.createArtifact(runId, nodeRun.id, {
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
              });
              ctx.nodes[nodeId] = full;
            }
            break;
          }

          if (typeof (value as any)?.delta === 'string') full += (value as any).delta;
          else if (value?.delta && typeof value.delta === 'object') full += value.delta['content'];
        }
      }

      await this.workflows.setCurrentNode(runId, null);
      await this.workflows.markRunCompleted(runId);
      this.logger.log(`Completed workflow run ${runId}`);
    } catch (err: any) {
      await this.workflows.markRunFailed(runId, err?.message ? String(err.message) : String(err));
      this.logger.error(`Failed workflow run ${runId}: ${err?.message ?? String(err)}`);
    }
  }
}
