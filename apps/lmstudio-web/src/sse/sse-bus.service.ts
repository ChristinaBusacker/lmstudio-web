import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';
import type { SseEnvelopeDto } from './dto/sse-events.dto';

type AnyEnvelope = SseEnvelopeDto<Record<string, any>>;

@Injectable()
export class SseBusService {
  private readonly stream$ = new Subject<AnyEnvelope>();

  private nextId = 1;

  private readonly chatBuffers = new Map<string, AnyEnvelope[]>();
  private readonly chatBufferSize = 250;

  // Workflows: replay buffers by workflowId and runId.
  private readonly workflowBuffers = new Map<string, AnyEnvelope[]>();
  private readonly workflowBufferSize = 300;

  private readonly workflowRunBuffers = new Map<string, AnyEnvelope[]>();
  private readonly workflowRunBufferSize = 500;

  private readonly runBuffer: AnyEnvelope[] = [];
  private readonly runBufferSize = 500;

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

  observeAll(): Observable<AnyEnvelope> {
    return this.stream$.asObservable();
  }

  observeChat(chatId: string): Observable<AnyEnvelope> {
    return this.observeAll().pipe(filter((e) => e.chatId === chatId));
  }

  /** Observe events for a workflow (all its runs). */
  observeWorkflow(workflowId: string): Observable<AnyEnvelope> {
    return this.observeAll().pipe(filter((e) => e.workflowId === workflowId));
  }

  /** Observe events for a single workflow run. */
  observeWorkflowRun(runId: string): Observable<AnyEnvelope> {
    return this.observeAll().pipe(filter((e) => e.runId === runId && !!e.workflowId));
  }

  observeGlobal(queueKey?: string): Observable<AnyEnvelope> {
    void queueKey;
    return this.observeAll().pipe(filter((e) => e.type === 'run.status'));
  }

  getChatReplay(chatId: string, lastEventId?: number): AnyEnvelope[] {
    const buf = this.chatBuffers.get(chatId) ?? [];
    if (!lastEventId) return [];
    return buf.filter((e) => e.id > lastEventId);
  }

  /** Replay events for a workflow since lastEventId (exclusive). */
  getWorkflowReplay(workflowId: string, lastEventId?: number): AnyEnvelope[] {
    const buf = this.workflowBuffers.get(workflowId) ?? [];
    if (!lastEventId) return [];
    return buf.filter((e) => e.id > lastEventId);
  }

  /** Replay events for a workflow run since lastEventId (exclusive). */
  getWorkflowRunReplay(runId: string, lastEventId?: number): AnyEnvelope[] {
    const buf = this.workflowRunBuffers.get(runId) ?? [];
    if (!lastEventId) return [];
    return buf.filter((e) => e.id > lastEventId);
  }

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
      return;
    }

    if (envelope.workflowId) {
      const wbuf = this.workflowBuffers.get(envelope.workflowId) ?? [];
      wbuf.push(envelope);
      if (wbuf.length > this.workflowBufferSize) {
        wbuf.splice(0, wbuf.length - this.workflowBufferSize);
      }
      this.workflowBuffers.set(envelope.workflowId, wbuf);

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
}
