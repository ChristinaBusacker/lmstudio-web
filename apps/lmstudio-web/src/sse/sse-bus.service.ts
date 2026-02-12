import { Injectable } from '@nestjs/common';
import type { SseEnvelope, SseEventType } from '@shared/contracts';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { RingBuffer } from './ring-buffer';

type AnyEnvelope = SseEnvelope<SseEventType, Record<string, any>>;

type BufferEntry = {
  buf: RingBuffer<AnyEnvelope>;
  lastSeenAt: number;
};

@Injectable()
export class SseBusService {
  private readonly stream$ = new Subject<AnyEnvelope>();
  private nextId = 1;

  private readonly chatBuffers = new Map<string, BufferEntry>();
  private readonly workflowBuffers = new Map<string, BufferEntry>();

  private readonly chatBufferSize = 250;
  private readonly workflowBufferSize = 300;

  private readonly workflowRunBuffers = new Map<string, AnyEnvelope[]>();
  private readonly workflowRunBufferSize = 500;

  private readonly runBuffer: AnyEnvelope[] = [];
  private readonly runBufferSize = 500;

  private readonly BUFFER_TTL_MS = 30 * 60_000;
  private readonly SWEEP_MS = 60_000;

  constructor() {
    setInterval(() => this.sweep(), this.SWEEP_MS).unref?.();
  }

  publish(event: Omit<AnyEnvelope, 'id' | 'ts'>): AnyEnvelope {
    const envelope: AnyEnvelope = {
      ...event,
      id: this.nextId++,
      ts: new Date().toISOString(),
    };

    this.store(envelope);
    this.stream$.next(envelope);
    return envelope;
  }

  publishEphemeral(event: Omit<AnyEnvelope, 'id' | 'ts'>): AnyEnvelope {
    const envelope: AnyEnvelope = {
      ...event,
      id: this.nextId++,
      ts: new Date().toISOString(),
    };

    // NOTE: no store(), no replay
    this.stream$.next(envelope);
    return envelope;
  }

  observeAll(): Observable<AnyEnvelope> {
    return this.stream$.asObservable();
  }

  observeChat(chatId: string): Observable<AnyEnvelope> {
    return this.observeAll().pipe(filter((e) => e.chatId === chatId));
  }

  observeWorkflow(workflowId: string): Observable<AnyEnvelope> {
    return this.observeAll().pipe(filter((e) => e.workflowId === workflowId));
  }

  observeWorkflowRun(runId: string): Observable<AnyEnvelope> {
    return this.observeAll().pipe(filter((e) => e.runId === runId && !!e.workflowId));
  }

  observeGlobal(queueKey?: string): Observable<AnyEnvelope> {
    void queueKey;
    // V1: as you currently do
    return this.observeAll().pipe(filter((e) => e.type === 'run.status'));
  }

  getChatReplay(chatId: string, lastEventId?: number): AnyEnvelope[] {
    if (!lastEventId) return [];
    const entry = this.chatBuffers.get(chatId);
    if (!entry) return [];
    // replay from ring buffer snapshot
    return entry.buf.toArray().filter((e) => e.id > lastEventId);
  }

  getWorkflowReplay(workflowId: string, lastEventId?: number): AnyEnvelope[] {
    if (!lastEventId) return [];
    const entry = this.workflowBuffers.get(workflowId);
    if (!entry) return [];
    return entry.buf.toArray().filter((e) => e.id > lastEventId);
  }

  getWorkflowRunReplay(runId: string, lastEventId?: number): AnyEnvelope[] {
    if (!lastEventId) return [];
    const buf = this.workflowRunBuffers.get(runId);
    if (!buf) return [];
    return buf.filter((e) => e.id > lastEventId);
  }

  getRunReplay(lastEventId?: number): AnyEnvelope[] {
    if (!lastEventId) return [];
    return this.runBuffer.filter((e) => e.id > lastEventId);
  }

  private store(envelope: AnyEnvelope) {
    if (envelope.chatId) {
      const buf = this.touchChat(envelope.chatId);
      buf.push(envelope);
      return;
    }

    if (envelope.workflowId) {
      const wbuf = this.touchWorkflow(envelope.workflowId);
      wbuf.push(envelope);

      if (envelope.runId) {
        const rbuf = this.workflowRunBuffers.get(envelope.runId) ?? [];
        rbuf.push(envelope);
        if (rbuf.length > this.workflowRunBufferSize) {
          rbuf.splice(0, rbuf.length - this.workflowRunBufferSize);
        }
        this.workflowRunBuffers.set(envelope.runId, rbuf);
      }

      return;
    }

    this.runBuffer.push(envelope);
    if (this.runBuffer.length > this.runBufferSize) {
      this.runBuffer.splice(0, this.runBuffer.length - this.runBufferSize);
    }
  }

  private touchChat(chatId: string): RingBuffer<AnyEnvelope> {
    const now = Date.now();
    const entry = this.chatBuffers.get(chatId);
    if (entry) {
      entry.lastSeenAt = now;
      return entry.buf;
    }
    const buf = new RingBuffer<AnyEnvelope>(this.chatBufferSize);
    this.chatBuffers.set(chatId, { buf, lastSeenAt: now });
    return buf;
  }

  private touchWorkflow(workflowId: string): RingBuffer<AnyEnvelope> {
    const now = Date.now();
    const entry = this.workflowBuffers.get(workflowId);
    if (entry) {
      entry.lastSeenAt = now;
      return entry.buf;
    }
    const buf = new RingBuffer<AnyEnvelope>(this.workflowBufferSize);
    this.workflowBuffers.set(workflowId, { buf, lastSeenAt: now });
    return buf;
  }

  private sweep() {
    const cutoff = Date.now() - this.BUFFER_TTL_MS;

    for (const [key, entry] of this.chatBuffers) {
      if (entry.lastSeenAt < cutoff) this.chatBuffers.delete(key);
    }

    for (const [key, entry] of this.workflowBuffers) {
      if (entry.lastSeenAt < cutoff) this.workflowBuffers.delete(key);
    }
  }
}
