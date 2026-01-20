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

@Injectable({ providedIn: 'root' })
export class SseService {
  private readonly store = inject(Store);
  private readonly zone = inject(NgZone);

  private globalEs: EventSource | null = null;

  private chatEs: EventSource | null = null;
  private chatId: string | null = null;

  connectGlobal(): void {
    if (this.globalEs) return;
    const es = new EventSource('/api/sse/global');

    const types = ['run.status', 'sidebar.changed', 'models.changed', 'heartbeat'];
    for (const t of types) es.addEventListener(t, (ev: MessageEvent) => this.handleRaw(ev.data));

    es.onerror = (e) => console.warn('[SSE] global error', e);
    this.globalEs = es;
  }

  /**
   * Connects chat-scoped SSE stream.
   * Call this when opening a chat (and close previous).
   */
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
  }
}
