import { SseBusService } from './sse-bus.service';
import type { SseEnvelopeOf } from '@shared/contracts';

function makeRunStatus(chatId: string): Omit<SseEnvelopeOf<'run.status'>, 'id' | 'ts'> {
  return {
    type: 'run.status',
    chatId,
    payload: {
      status: 'running',
    },
  };
}

function makeVariantSnapshot(chatId: string): Omit<SseEnvelopeOf<'variant.snapshot'>, 'id' | 'ts'> {
  return {
    type: 'variant.snapshot',
    chatId,
    payload: {
      content: 'hello',
      reasoning: null,
    },
  };
}

describe('SseBusService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('assigns incremental ids and timestamps when publishing', () => {
    const bus = new SseBusService();

    const a = bus.publish(makeRunStatus('c1'));
    const b = bus.publish(makeRunStatus('c1'));

    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(typeof a.ts).toBe('string');
    expect(typeof b.ts).toBe('string');
  });

  it('stores chat-scoped events for replay', () => {
    const bus = new SseBusService();
    const e1 = bus.publish(makeRunStatus('c1'));
    const e2 = bus.publish(makeVariantSnapshot('c1'));

    // replay requires lastEventId to be set
    const replay = bus.getChatReplay('c1', e1.id);
    expect(replay.map((e) => e.id)).toEqual([e2.id]);
  });

  it('does not store ephemeral events (no replay)', () => {
    const bus = new SseBusService();
    const persisted = bus.publish(makeRunStatus('c1'));
    const ephemeral = bus.publishEphemeral(makeVariantSnapshot('c1'));

    const replay = bus.getChatReplay('c1', persisted.id);
    expect(replay.find((e) => e.id === ephemeral.id)).toBeUndefined();
  });

  it('sweeps old buffers based on TTL', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const start = 1_000_000;
    nowSpy.mockReturnValue(start);

    const bus = new SseBusService();
    const persisted = bus.publish(makeRunStatus('c1'));

    // Move time forward beyond TTL (30 minutes) and trigger the sweep interval (60s).
    nowSpy.mockReturnValue(start + 30 * 60_000 + 1);
    jest.advanceTimersByTime(60_000);

    // If the chat buffer was swept, replay should be empty.
    expect(bus.getChatReplay('c1', persisted.id)).toEqual([]);
  });
});
