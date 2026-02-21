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

function makeWorkflowEvent(
  workflowId: string,
  runId?: string,
): Omit<SseEnvelopeOf<'workflow.run.status'>, 'id' | 'ts'> {
  return {
    type: 'workflow.run.status',
    workflowId,
    runId,
    payload: { status: 'running' },
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

  it('stores workflow-scoped events for replay, including workflow-run replay when runId is present', () => {
    const bus = new SseBusService();
    const w1 = bus.publish(makeWorkflowEvent('w1', 'wr1'));
    const w2 = bus.publish(makeWorkflowEvent('w1', 'wr1'));
    const wOther = bus.publish(makeWorkflowEvent('w2', 'wr2'));

    expect(bus.getWorkflowReplay('w1', w1.id).map((e) => e.id)).toEqual([w2.id]);
    expect(bus.getWorkflowRunReplay('wr1', w1.id).map((e) => e.id)).toEqual([w2.id]);
    expect(bus.getWorkflowReplay('w2', wOther.id)).toEqual([]);
  });

  it('stores global run.status events in run replay buffer (non-chat non-workflow)', () => {
    const bus = new SseBusService();

    // run.status always includes chatId in this app, so emulate a global-ish event without chatId
    const e1 = bus.publish({ type: 'run.status', payload: { status: 'queued' } });
    const e2 = bus.publish({ type: 'run.status', payload: { status: 'running' } });

    const replay = bus.getRunReplay(e1.id);
    expect(replay.map((e) => e.id)).toEqual([e2.id]);
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
