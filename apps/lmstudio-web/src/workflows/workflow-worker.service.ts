/* eslint-disable @typescript-eslint/restrict-plus-operands */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { SettingsService } from '../settings/settings.service';
import { ChatEngineService } from '../chats/chat-engine.service';
import type { LmMessage } from '../common/types/llm.types';

type Graph = { nodes?: any[]; edges?: any[] };

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

  private topoSort(graph: Graph): string[] {
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];

    const ids = nodes.map((n) => n?.id).filter(Boolean);
    const indeg = new Map<string, number>();
    const adj = new Map<string, Set<string>>();

    for (const id of ids) indeg.set(id, 0);

    for (const e of edges) {
      const from = e?.source;
      const to = e?.target;
      if (!from || !to) continue;
      if (!indeg.has(from) || !indeg.has(to)) continue;
      indeg.set(to, (indeg.get(to) ?? 0) + 1);
      if (!adj.has(from)) adj.set(from, new Set());
      adj.get(from)!.add(to);
    }

    const q: string[] = [];
    for (const [id, d] of indeg) if (d === 0) q.push(id);

    const out: string[] = [];
    while (q.length) {
      const cur = q.shift()!;
      out.push(cur);
      for (const nx of adj.get(cur) ?? []) {
        indeg.set(nx, (indeg.get(nx) ?? 0) - 1);
        if (indeg.get(nx) === 0) q.push(nx);
      }
    }

    // Fallback: if cycle/missing edges -> preserve node list order
    if (out.length !== ids.length) return ids;
    return out;
  }

  private renderTemplate(input: string, ctx: any): string {
    const alias = input.replace(/\{\{\s*steps\./g, '{{nodes.');
    return alias.replace(
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

      const nodeById = new Map<string, any>();
      for (const n of graph.nodes ?? []) if (n?.id) nodeById.set(n.id, n);

      // Context of resolved outputs for templating
      const ctx: any = { nodes: {} };

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
        if (nodeType !== 'lmstudio.llm') {
          await this.workflows.upsertNodeRun(runId, nodeId, {
            status: 'failed',
            error: `Unsupported node type: ${nodeType}`,
            finishedAt: new Date(),
          });
          throw new Error(`Unsupported node type: ${nodeType}`);
        }

        const profileName = String(node.profileName ?? '').trim();
        const rawPrompt = String(node.prompt ?? '').trim();
        if (!profileName) throw new Error(`Node ${nodeId} missing profileName`);
        if (!rawPrompt) throw new Error(`Node ${nodeId} missing prompt`);

        const profile = await this.settings.getByName(this.ownerKey, profileName);
        if (!profile) throw new Error(`Settings profile not found: ${profileName}`);

        const params = (profile.params ?? {}) as Record<string, any>;
        if (!params.modelKey) throw new Error(`Profile "${profileName}" has no modelKey`);

        const renderedPrompt = this.renderTemplate(rawPrompt, ctx);
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
            prompt: renderedPrompt,
          },
          error: null,
        });

        // Stream into local buffer; we persist at the end (V1).
        let full = '';
        const gen = this.engine.streamChat(
          runId + ':' + nodeId,
          this.buildMessages(systemPrompt, renderedPrompt),
          params,
        );

        while (true) {
          const { value, done } = await gen.next();
          if (done) {
            // Persist outputs
            const parsed = this.safeJsonParse(full.trim());
            let artifact;
            if (parsed.ok) {
              artifact = await this.workflows.createArtifact(runId, nodeRun.id, {
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
              artifact = await this.workflows.createArtifact(runId, nodeRun.id, {
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
          else if (value?.delta && typeof value.delta === 'object') {
            full += value.delta['content'];
          }
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
