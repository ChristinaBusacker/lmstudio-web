import { Subject, firstValueFrom, take, toArray } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import type { SseEnvelopeOf, SseEnvelope } from '@shared/contracts';
import { SseController } from './sse.controller';
import { createMockRequest } from '../../test/utils/mock-request';
import type { SseBusService } from './sse-bus.service';

type AnyEnvelope = SseEnvelope;

function envRunStatus(chatId?: string): AnyEnvelope {
  const envelope: SseEnvelopeOf<'run.status'> = {
    id: 1,
    ts: new Date().toISOString(),
    type: 'run.status',
    chatId,
    payload: { status: 'running' },
  };
  return envelope;
}

function envVariant(chatId: string): AnyEnvelope {
  const envelope: SseEnvelopeOf<'variant.snapshot'> = {
    id: 2,
    ts: new Date().toISOString(),
    type: 'variant.snapshot',
    chatId,
    payload: { content: 'hi', reasoning: null },
  };
  return envelope;
}

describe('SseController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('parses Last-Event-ID header (case-insensitive)', async () => {
    const live$ = new Subject<AnyEnvelope>();

    const bus = {
      getChatReplay: jest.fn(() => [] as AnyEnvelope[]),
      observeChat: jest.fn(() => live$.asObservable()),
      getRunReplay: jest.fn(() => [] as AnyEnvelope[]),
      observeAll: jest.fn(() => live$.asObservable()),
      getWorkflowReplay: jest.fn(() => [] as AnyEnvelope[]),
      observeWorkflow: jest.fn(() => live$.asObservable()),
      getWorkflowRunReplay: jest.fn(() => [] as AnyEnvelope[]),
      observeWorkflowRun: jest.fn(() => live$.asObservable()),
    };

    const controller = new SseController(bus as unknown as SseBusService);

    const reqLower = createMockRequest({ 'last-event-id': '123' });
    controller.streamGlobal(reqLower).pipe(take(1)).subscribe();
    expect(bus.getRunReplay).toHaveBeenCalledWith(123);

    const reqUpper = createMockRequest({ 'Last-Event-ID': '456' });
    controller.streamGlobal(reqUpper).pipe(take(1)).subscribe();
    expect(bus.getRunReplay).toHaveBeenCalledWith(456);
  });

  it('filters chat stream based on includeVariants/includeRuns flags', async () => {
    const live$ = new Subject<AnyEnvelope>();

    const bus = {
      getChatReplay: jest.fn(() => [envRunStatus('c1'), envVariant('c1')]),
      observeChat: jest.fn(() => live$.asObservable()),
      getRunReplay: jest.fn(() => [] as AnyEnvelope[]),
      observeAll: jest.fn(() => live$.asObservable()),
      getWorkflowReplay: jest.fn(() => [] as AnyEnvelope[]),
      observeWorkflow: jest.fn(() => live$.asObservable()),
      getWorkflowRunReplay: jest.fn(() => [] as AnyEnvelope[]),
      observeWorkflowRun: jest.fn(() => live$.asObservable()),
    };

    const controller = new SseController(bus as unknown as SseBusService);
    const req = createMockRequest({ 'last-event-id': '0' });

    const resultsPromise = firstValueFrom(
      controller.streamChat(req, 'c1', 'false', 'true').pipe(take(2), toArray()),
    );

    // Emit a live variant + run status; variant should be filtered out.
    live$.next(envVariant('c1'));
    live$.next(envRunStatus('c1'));

    const results: MessageEvent[] = await resultsPromise;
    const types = results.map((e) => e.type);
    expect(types).toEqual(['run.status', 'run.status']);
  });
});
