import { RunsService } from './runs.service';
import { RunEntity } from './entities/run.entity';
import { SseBusService } from '../sse/sse-bus.service';
import type { Repository } from 'typeorm';
import type { SseEnvelopeOf, SseEventType } from '@shared/contracts';

function makeRun(id: string, status: RunEntity['status']): RunEntity {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    chatId: 'c1',
    chat: null as unknown as never,
    queueKey: 'default',
    clientRequestId: '11111111-1111-1111-1111-111111111111',
    status,
    settingsProfileId: null,
    settingsSnapshot: {},
    promptProfileHash: null,
    content: '',
    stats: null,
    error: null,
    lockedBy: null,
    lockedAt: null,
    startedAt: null,
    finishedAt: null,
    sourceMessageId: null,
    targetMessageId: null,
    createdVariantId: null,
    headMessageIdAtStart: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('RunsService', () => {
  test('createQueuedRun saves run and publishes run.status', async () => {
    const saved = makeRun('r1', 'queued');

    const repo: Partial<Repository<RunEntity>> = {
      create: jest.fn((_x: unknown) => saved),
      save: jest.fn(async (_x: unknown) => saved),
      findOne: jest.fn(async () => saved),
    };

    const publishImpl: SseBusService['publish'] = (<TType extends SseEventType>(
      event: Omit<SseEnvelopeOf<TType>, 'id' | 'ts'>,
    ) => {
      return {
        ...(event as unknown as SseEnvelopeOf<TType>),
        id: 1,
        ts: '2026-01-01T00:00:00.000Z',
      };
    }) as SseBusService['publish'];

    const sse: Partial<SseBusService> = {
      publish: jest.fn(publishImpl),
    };

    const svc = new RunsService(repo as Repository<RunEntity>, sse as SseBusService);

    const out = await svc.createQueuedRun({
      chatId: 'c1',
      clientRequestId: saved.clientRequestId,
      settingsSnapshot: {},
    });

    expect(out.id).toBe('r1');
    expect(repo.save).toHaveBeenCalled();
    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run.status', runId: 'r1', chatId: 'c1' }),
    );
  });

  test('markCanceledIfNotTerminal does nothing for completed runs', async () => {
    const completed = makeRun('r2', 'completed');

    const repo: Partial<Repository<RunEntity>> = {
      findOne: jest.fn(async () => completed),
      update: jest.fn(async () => ({ affected: 1 }) as unknown),
    };

    const publishImpl2: SseBusService['publish'] = (<TType extends SseEventType>(
      event: Omit<SseEnvelopeOf<TType>, 'id' | 'ts'>,
    ) => {
      return {
        ...(event as unknown as SseEnvelopeOf<TType>),
        id: 1,
        ts: '2026-01-01T00:00:00.000Z',
      };
    }) as SseBusService['publish'];

    const sse: Partial<SseBusService> = {
      publish: jest.fn(publishImpl2),
    };

    const svc = new RunsService(repo as Repository<RunEntity>, sse as SseBusService);

    await svc.markCanceledIfNotTerminal('r2');

    expect(repo.update).not.toHaveBeenCalled();
    expect(sse.publish).not.toHaveBeenCalled();
  });

  test('claimNextQueued returns null when there is no queued run', async () => {
    const repo: Partial<Repository<RunEntity>> = {
      findOne: jest.fn(async () => null),
    };

    const sse: Partial<SseBusService> = {
      publish: jest.fn() as unknown as SseBusService['publish'],
    };
    const svc = new RunsService(repo as Repository<RunEntity>, sse as SseBusService);

    await expect(svc.claimNextQueued('default', 'worker1')).resolves.toBeNull();
    expect(repo.findOne).toHaveBeenCalled();
    expect(sse.publish).not.toHaveBeenCalled();
  });

  test('claimNextQueued returns null when update loses the race', async () => {
    const queued = makeRun('r1', 'queued');

    const repo: Partial<Repository<RunEntity>> = {
      findOne: jest.fn(async (opts: unknown) => {
        // first findOne returns queued, second returns updated snapshot
        const o = opts as { where?: { id?: string } };
        if (o?.where?.id === 'r1') return queued;
        return queued;
      }),
      update: jest.fn(async () => ({ affected: 0 }) as unknown),
    };

    const sse: Partial<SseBusService> = {
      publish: jest.fn() as unknown as SseBusService['publish'],
    };
    const svc = new RunsService(repo as Repository<RunEntity>, sse as SseBusService);

    await expect(svc.claimNextQueued('default', 'worker1')).resolves.toBeNull();
    expect(repo.update).toHaveBeenCalled();
    expect(sse.publish).not.toHaveBeenCalled();
  });

  test('unlockStaleRunning unlocks only stale runs and emits run.status for each', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T01:00:00.000Z'));

    const stale = makeRun('r1', 'running');
    stale.lockedBy = 'worker1';
    stale.lockedAt = new Date('2026-01-01T00:00:00.000Z');

    const fresh = makeRun('r2', 'running');
    fresh.lockedBy = 'worker1';
    fresh.lockedAt = new Date('2026-01-01T00:59:30.000Z');

    const repo: Partial<Repository<RunEntity>> = {
      find: jest.fn(async () => [fresh, stale]),
      update: jest.fn(async () => ({ affected: 1 }) as unknown),
      findOne: jest.fn(async () => stale),
    };

    const publishImpl: SseBusService['publish'] = (<TType extends SseEventType>(
      event: Omit<SseEnvelopeOf<TType>, 'id' | 'ts'>,
    ) => {
      return {
        ...(event as unknown as SseEnvelopeOf<TType>),
        id: 1,
        ts: '2026-01-01T00:00:00.000Z',
      };
    }) as SseBusService['publish'];

    const sse: Partial<SseBusService> = {
      publish: jest.fn(publishImpl),
    };

    const svc = new RunsService(repo as Repository<RunEntity>, sse as SseBusService);

    const count = await svc.unlockStaleRunning('worker1', 60_000);
    expect(count).toBe(1);
    expect(repo.update).toHaveBeenCalledWith(
      { id: 'r1' },
      expect.objectContaining({ status: 'queued', lockedBy: null }),
    );
    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run.status', runId: 'r1' }),
    );
  });
});
