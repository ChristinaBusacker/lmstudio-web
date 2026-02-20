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
      update: jest.fn(async () => ({ affected: 1 } as unknown)),
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
});
