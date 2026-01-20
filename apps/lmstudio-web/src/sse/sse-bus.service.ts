import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { SseEnvelopeDto } from './dto/sse-events.dto';

type AnyEnvelope = SseEnvelopeDto<Record<string, any>>;

/**
 * In-process event bus + ring buffer replay.
 *
 * - DB remains the source of truth.
 * - SSE is for UX: live updates + best-effort replay after disconnect.
 * - Replay uses Last-Event-ID (SSE standard) and an in-memory ring buffer.
 *
 * Limitations:
 * - On server restart, buffer is lost -> clients resync via REST (thread + runs).
 * - For multi-instance deployments, replace this with Redis/NATS/etc (same envelope contract).
 */
@Injectable()
export class SseBusService {
  private readonly stream$ = new Subject<AnyEnvelope>();

  private nextId = 1;

  // Simple ring buffer per chat and a separate global ring buffer for runs.
  // You can adjust sizes depending on how "chatty" your events are.
  private readonly chatBuffers = new Map<string, AnyEnvelope[]>();
  private readonly chatBufferSize = 250;

  private readonly runBuffer: AnyEnvelope[] = [];
  private readonly runBufferSize = 500;

  /**
   * Publish a new SSE event.
   *
   * @param event Partial envelope (id/ts will be added)
   */
  publish(event: Omit<AnyEnvelope, 'id' | 'ts'>): AnyEnvelope {
    const envelope: AnyEnvelope = {
      ...event,
      id: this.nextId++,
      ts: new Date().toISOString(),
    };

    // Store for replay
    this.store(envelope);

    // Emit live
    this.stream$.next(envelope);

    return envelope;
  }

  /**
   * Observe all events.
   */
  observeAll(): Observable<AnyEnvelope> {
    return this.stream$.asObservable();
  }

  /**
   * Observe events for a specific chat.
   */
  observeChat(chatId: string): Observable<AnyEnvelope> {
    return this.observeAll().pipe(filter((e) => e.chatId === chatId));
  }

  /**
   * Observe only run-related events (global).
   */
  observeGlobal(queueKey?: string): Observable<AnyEnvelope> {
    // Queue scoping can be added later by including queueKey in payload/envelope
    void queueKey;
    return this.observeAll().pipe(filter((e) => e.type === 'run.status'));
  }

  /**
   * Get replay events for a chat since lastEventId (exclusive).
   */
  getChatReplay(chatId: string, lastEventId?: number): AnyEnvelope[] {
    const buf = this.chatBuffers.get(chatId) ?? [];
    if (!lastEventId) return [];
    return buf.filter((e) => e.id > lastEventId);
  }

  /**
   * Get replay events for global run stream since lastEventId (exclusive).
   */
  getRunReplay(lastEventId?: number): AnyEnvelope[] {
    if (!lastEventId) return [];
    return this.runBuffer.filter((e) => e.id > lastEventId);
  }

  private store(envelope: AnyEnvelope) {
    if (envelope.chatId) {
      const buf = this.chatBuffers.get(envelope.chatId) ?? [];
      buf.push(envelope);
      if (buf.length > this.chatBufferSize) buf.splice(0, buf.length - this.chatBufferSize);
      this.chatBuffers.set(envelope.chatId, buf);
    } else {
      // global buffer for events without chatId (runs + sidebar + models + heartbeat-global)
      this.runBuffer.push(envelope);
      if (this.runBuffer.length > this.runBufferSize) {
        this.runBuffer.splice(0, this.runBuffer.length - this.runBufferSize);
      }
    }
  }
}
