/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
} from '../state/workflows/workflow.actions';

@Injectable({ providedIn: 'root' })
export class SseService {
  private readonly store = inject(Store);
  private readonly zone = inject(NgZone);

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

    const types = ['run.status', 'sidebar.changed', 'models.changed', 'heartbeat'];
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

  /** Workflow scoped: good for run list + “current running node” indicator */
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

  private handleRaw(raw: any): void {
    const text = typeof raw === 'string' ? raw : '';
    if (!text) return;

    let msg: SseEnvelopeDto | null = null;
    try {
      msg = JSON.parse(text) as SseEnvelopeDto;
    } catch {
      return;
    }
    if (!msg) return;

    this.zone.run(() => this.routeEvent(msg));
  }

  private routeEvent(e: SseEnvelopeDto): void {
    // ----- existing chat/global routing -----
    if (e.type === 'sidebar.changed') {
      this.store.dispatch(new SidebarChanged());
      return;
    }
    if (e.type === 'models.changed') {
      this.store.dispatch(new ModelsChanged());
      return;
    }

    if (e.type === 'run.status' && e.chatId && e.runId) {
      const status = e.payload?.status;
      if (!status) return;

      this.store.dispatch(
        new ApplyRunStatusFromSse({
          chatId: e.chatId,
          runId: e.runId,
          status,
          stats: e.payload?.stats ?? null,
          error: e.payload?.error ?? null,
        }),
      );
      return;
    }

    if (e.type === 'variant.snapshot' && e.chatId) {
      const messageId = e.messageId ?? e.payload?.messageId;
      const content = e.payload?.content ?? '';
      const reasoning = e.payload?.reasoning ?? null;

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
      this.store.dispatch(
        new ApplyWorkflowRunStatusFromSse({
          workflowId: e.workflowId,
          runId: e.runId,
          status: e.payload?.status,
          currentNodeId: e.payload?.currentNodeId ?? null,
          stats: e.payload?.stats ?? null,
          error: e.payload?.error ?? null,
        }),
      );
      return;
    }

    if (e.type === 'workflow.node-run.upsert' && e.workflowId && e.runId) {
      const nodeId = e.nodeId ?? e.payload?.nodeId;
      if (!nodeId) return;

      this.store.dispatch(
        new ApplyWorkflowNodeRunUpsertFromSse({
          workflowId: e.workflowId,
          runId: e.runId,
          nodeId,
          status: e.payload?.status,
          error: e.payload?.error ?? null,
          startedAt: e.payload?.startedAt ?? null,
          finishedAt: e.payload?.finishedAt ?? null,
        }),
      );
      return;
    }

    if (e.type === 'workflow.artifact.created' && e.workflowId && e.runId) {
      const artifactId = e.artifactId ?? e.payload?.artifactId;
      if (!artifactId) return;

      this.store.dispatch(
        new ApplyWorkflowArtifactCreatedFromSse({
          workflowId: e.workflowId,
          runId: e.runId,
          artifactId,
          nodeId: e.nodeId ?? e.payload?.nodeId ?? null,
          kind: e.payload?.kind,
          mimeType: e.payload?.mimeType ?? null,
          filename: e.payload?.filename ?? null,
        }),
      );
    }
  }
}
