import { Injectable, NgZone, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import type { SseEnvelopeDto } from './sse-events.model';
import { SidebarChanged } from '../state/chats/chats.actions';
import { ModelsChanged } from '../state/models/models.actions';
import {
  ApplyRunStatusFromSse,
  ApplyVariantSnapshotFromSse,
} from '../state/chat-detail/chat-detail.actions';
import {
  ApplyWorkflowArtifactCreatedFromSse,
  ApplyWorkflowNodeRunUpsertFromSse,
  ApplyWorkflowRunStatusFromSse,
  LoadWorkflowRunDetails,
} from '../state/workflows/workflow.actions';
import type {
  ArtifactKind,
  WorkflowNodeRunStatus,
  WorkflowRunStatus,
} from '../state/workflows/workflow.models';
import { ToastService } from '../../ui/toast/toast.service';
import type { JsonRecord } from '../utils/typed-access';
import {
  getArray,
  getBoolean,
  getRecord,
  getString,
  isRecord,
  safeJsonParse,
} from '../utils/typed-access';
import { JsonObject } from '@shared/index';

@Injectable({ providedIn: 'root' })
export class SseService {
  private readonly store = inject(Store);
  private readonly zone = inject(NgZone);
  private readonly toast = inject(ToastService);

  private lastExternalOk: Record<string, boolean> = {};

  private globalEs: EventSource | null = null;

  private chatEs: EventSource | null = null;
  private chatId: string | null = null;

  private workflowEs: EventSource | null = null;
  private workflowId: string | null = null;

  private workflowRunEs: EventSource | null = null;
  private workflowRunId: string | null = null;

  connectGlobal(): void {
    if (this.globalEs) return;
    const es = new EventSource('/api/sse/global');

    const types = [
      'run.status',
      'sidebar.changed',
      'models.changed',
      'external.status',
      'heartbeat',
    ];
    for (const t of types) es.addEventListener(t, (ev: MessageEvent) => this.handleRaw(ev.data));

    es.onerror = (e) => console.warn('[SSE] global error', e);
    this.globalEs = es;
  }

  connectChat(chatId: string): void {
    if (this.chatEs && this.chatId === chatId) return;

    this.disconnectChat();

    const es = new EventSource(`/api/sse/chats/${encodeURIComponent(chatId)}`);

    const types = ['run.status', 'variant.snapshot', 'heartbeat'];
    for (const t of types) es.addEventListener(t, (ev: MessageEvent) => this.handleRaw(ev.data));

    es.onerror = (e) => console.warn('[SSE] chat error', e);

    this.chatEs = es;
    this.chatId = chatId;
  }

  disconnectChat(): void {
    if (this.chatEs) this.chatEs.close();
    this.chatEs = null;
    this.chatId = null;
  }

  connectWorkflow(workflowId: string): void {
    if (this.workflowEs && this.workflowId === workflowId) return;

    this.disconnectWorkflow();

    const es = new EventSource(`/api/sse/workflows/${encodeURIComponent(workflowId)}`);

    const types = [
      'workflow.run.status',
      'workflow.node-run.upsert',
      'workflow.artifact.created',
      'heartbeat',
    ];
    for (const t of types) es.addEventListener(t, (ev: MessageEvent) => this.handleRaw(ev.data));

    es.onerror = (e) => console.warn('[SSE] workflow error', e);

    this.workflowEs = es;
    this.workflowId = workflowId;
  }

  disconnectWorkflow(): void {
    if (this.workflowEs) this.workflowEs.close();
    this.workflowEs = null;
    this.workflowId = null;
  }

  /** Run scoped: best for run details page */
  connectWorkflowRun(runId: string, workflowId?: string): void {
    if (this.workflowRunEs && this.workflowRunId === runId) return;

    this.disconnectWorkflowRun();

    const qs = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';
    const es = new EventSource(`/api/sse/workflow-runs/${encodeURIComponent(runId)}${qs}`);

    const types = [
      'workflow.run.status',
      'workflow.node-run.upsert',
      'workflow.artifact.created',
      'heartbeat',
    ];
    for (const t of types) es.addEventListener(t, (ev: MessageEvent) => this.handleRaw(ev.data));

    es.onerror = (e) => console.warn('[SSE] workflow-run error', e);

    this.workflowRunEs = es;
    this.workflowRunId = runId;
  }

  disconnectWorkflowRun(): void {
    if (this.workflowRunEs) this.workflowRunEs.close();
    this.workflowRunEs = null;
    this.workflowRunId = null;
  }

  private handleRaw(raw: unknown): void {
    const text = typeof raw === 'string' ? raw : '';
    if (!text) return;

    const parsed = safeJsonParse(text);
    const msg = this.parseEnvelope(parsed);
    if (!msg) return;

    this.zone.run(() => this.routeEvent(msg));
  }

  private routeEvent(e: SseEnvelopeDto<unknown>): void {
    if (e.type === 'external.status') {
      const payload = getRecord(e.payload);
      const servicesRaw = payload ? getArray(payload, 'services') : null;
      const services = (servicesRaw ?? []).filter(isRecord) as JsonRecord[];

      for (const s of services) {
        const key = String(getString(s, 'name') ?? '');
        if (!key) continue;

        const prev = this.lastExternalOk[key];
        const now = !!getBoolean(s, 'ok');
        this.lastExternalOk[key] = now;

        // First snapshot: only alert if it's already down (and enabled).
        if (prev === undefined) {
          if (!now && !!getBoolean(s, 'enabled')) {
            this.toast.warning(
              `${this.titleCase(key)} not reachable`,
              getString(s, 'error') ?? null,
            );
          }
          continue;
        }

        if (prev !== now && !!getBoolean(s, 'enabled')) {
          if (!now) {
            this.toast.warning(
              `${this.titleCase(key)} went offline`,
              getString(s, 'error') ?? null,
            );
          } else {
            this.toast.success(`${this.titleCase(key)} is back`, getString(s, 'baseUrl') ?? null);
          }
        }
      }
      return;
    }

    // ----- existing chat/global routing -----
    if (e.type === 'sidebar.changed') {
      this.store.dispatch(new SidebarChanged());
      return;
    }
    if (e.type === 'models.changed') {
      this.store.dispatch(new ModelsChanged());
      return;
    }

    if (e.type === 'workflow.artifact.created') {
      if (e.runId) {
        this.store.dispatch(new LoadWorkflowRunDetails(e.runId));
      }
    }

    const payload = getRecord(e.payload);

    if (e.type === 'run.status' && e.chatId && e.runId) {
      const status = this.parseChatRunStatus(payload ? getString(payload, 'status') : null);
      if (!status) return;

      this.store.dispatch(
        new ApplyRunStatusFromSse({
          chatId: e.chatId,
          runId: e.runId,
          status,
          stats: payload ? ((payload['stats'] ?? undefined) as JsonObject) : undefined,
          error: payload ? (getString(payload, 'error') ?? null) : null,
        }),
      );
      return;
    }

    if (e.type === 'variant.snapshot' && e.chatId) {
      const messageId = e.messageId ?? (payload ? getString(payload, 'messageId') : null);
      const content = payload ? (getString(payload, 'content') ?? '') : '';
      const reasoning = payload ? (getString(payload, 'reasoning') ?? null) : null;

      if (!messageId) return;

      this.store.dispatch(
        new ApplyVariantSnapshotFromSse({
          chatId: e.chatId,
          runId: e.runId,
          messageId,
          content,
          reasoning,
        }),
      );
      return;
    }

    // ----- workflows routing -----
    if (e.type === 'workflow.run.status' && e.workflowId && e.runId) {
      const status = this.parseWorkflowRunStatus(payload ? getString(payload, 'status') : null);
      if (!status) return;

      this.store.dispatch(
        new ApplyWorkflowRunStatusFromSse({
          workflowId: e.workflowId,
          runId: e.runId,
          status,
          currentNodeId: payload ? (getString(payload, 'currentNodeId') ?? null) : null,
          stats: payload ? ((payload['stats'] ?? undefined) as JsonObject) : null,
          error: payload ? (getString(payload, 'error') ?? null) : null,
        }),
      );
      return;
    }

    if (e.type === 'workflow.node-run.upsert' && e.workflowId && e.runId) {
      const nodeId = e.nodeId ?? (payload ? getString(payload, 'nodeId') : null);
      if (!nodeId) return;

      const status = this.parseWorkflowNodeRunStatus(payload ? getString(payload, 'status') : null);
      if (!status) return;

      this.store.dispatch(
        new ApplyWorkflowNodeRunUpsertFromSse({
          workflowId: e.workflowId,
          runId: e.runId,
          nodeId,
          status,
          error: payload ? (getString(payload, 'error') ?? null) : null,
          startedAt: payload ? (getString(payload, 'startedAt') ?? null) : null,
          finishedAt: payload ? (getString(payload, 'finishedAt') ?? null) : null,
        }),
      );
      return;
    }

    if (e.type === 'workflow.artifact.created' && e.workflowId && e.runId) {
      const artifactId = e.artifactId ?? (payload ? getString(payload, 'artifactId') : null);
      if (!artifactId) return;

      const kind = this.parseArtifactKind(payload ? getString(payload, 'kind') : null);
      if (!kind) return;

      this.store.dispatch(
        new ApplyWorkflowArtifactCreatedFromSse({
          workflowId: e.workflowId,
          runId: e.runId,
          artifactId,
          nodeId: e.nodeId ?? (payload ? (getString(payload, 'nodeId') ?? null) : null),
          kind,
          mimeType: payload ? (getString(payload, 'mimeType') ?? null) : null,
          filename: payload ? (getString(payload, 'filename') ?? null) : null,
        }),
      );
    }
  }

  private parseEnvelope(value: unknown): SseEnvelopeDto<unknown> | null {
    const root = getRecord(value);
    if (!root) return null;

    const type = getString(root, 'type');
    const id = root['id'];
    const payload = root['payload'];
    const ts = root['ts'];

    if (!type) return null;
    if (typeof id !== 'number') return null;
    if (typeof ts !== 'string' && typeof ts !== 'number') return null;

    // Keep additional optional ids if present.
    // Build as a mutable record first, then cast at the end.
    const out: Record<string, unknown> = {
      id,
      type,
      ts,
      payload,
    };

    for (const key of [
      'chatId',
      'workflowId',
      'runId',
      'nodeId',
      'artifactId',
      'messageId',
      'createdAt',
    ]) {
      const v = root[key];
      if (typeof v === 'string') out[key] = v;
    }

    return out as unknown as SseEnvelopeDto<unknown>;
  }

  private parseChatRunStatus(
    value: string | null,
  ): 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | null {
    if (!value) return null;
    const allowed = ['queued', 'running', 'completed', 'failed', 'canceled'] as const;
    return (allowed as readonly string[]).includes(value)
      ? (value as (typeof allowed)[number])
      : null;
  }

  private parseWorkflowRunStatus(value: string | null): WorkflowRunStatus | null {
    if (!value) return null;
    const allowed: readonly WorkflowRunStatus[] = [
      'queued',
      'running',
      'paused',
      'completed',
      'failed',
      'canceled',
    ];
    return (allowed as readonly string[]).includes(value) ? (value as WorkflowRunStatus) : null;
  }

  private parseWorkflowNodeRunStatus(value: string | null): WorkflowNodeRunStatus | null {
    if (!value) return null;
    const allowed: readonly WorkflowNodeRunStatus[] = [
      'pending',
      'running',
      'completed',
      'failed',
      'stale',
    ];
    return (allowed as readonly string[]).includes(value) ? (value as WorkflowNodeRunStatus) : null;
  }

  private parseArtifactKind(value: string | null): ArtifactKind | null {
    if (!value) return null;
    const allowed: readonly ArtifactKind[] = ['json', 'text', 'image', 'binary'];
    return (allowed as readonly string[]).includes(value) ? (value as ArtifactKind) : null;
  }

  private titleCase(x: string): string {
    return x.length ? x.charAt(0).toUpperCase() + x.slice(1) : x;
  }
}
