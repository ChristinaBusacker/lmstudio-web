/* eslint-disable @typescript-eslint/no-unused-vars */
import { RunsService } from './runs.service';
import type { RunEntity } from './entities/run.entity';
import type { DeepPartial, Repository, UpdateResult } from 'typeorm';
import { SseBusService } from '../sse/sse-bus.service';

type RunsRepoMock = {
  create: jest.MockedFunction<(entityLike: DeepPartial<RunEntity>) => RunEntity>;
  save: jest.MockedFunction<(entity: DeepPartial<RunEntity>) => Promise<RunEntity>>;
  findOne: jest.MockedFunction<(opts: unknown) => Promise<RunEntity | null>>;
  find: jest.MockedFunction<(opts?: unknown) => Promise<RunEntity[]>>;
  update: jest.MockedFunction<
    (criteria: unknown, partial: DeepPartial<RunEntity>) => Promise<UpdateResult>
  >;
};

function makeRunsRepoMock(seed?: Partial<RunsRepoMock>): RunsRepoMock {
  const repo: RunsRepoMock = {
    create: jest.fn((entityLike: DeepPartial<RunEntity>) => entityLike as RunEntity),
    save: jest.fn(async (entity: DeepPartial<RunEntity>) => entity as RunEntity),
    findOne: jest.fn(async (_opts: unknown) => null),
    find: jest.fn(async (_opts?: unknown) => []),
    update: jest.fn(async (_criteria: unknown, _partial: DeepPartial<RunEntity>) => {
      const res: UpdateResult = { affected: 1, raw: [], generatedMaps: [] };
      return res;
    }),
  };

  if (seed) Object.assign(repo, seed);
  return repo;
}

describe('RunsService', () => {
  const makeRun = (partial: DeepPartial<RunEntity>): RunEntity => partial as RunEntity;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  const createService = (repo: RunsRepoMock) => {
    const sse = new SseBusService();
    const publishSpy = jest.spyOn(sse, 'publish');
    const service = new RunsService(repo as unknown as Repository<RunEntity>, sse);
    return { service, sse, publishSpy };
  };

  describe('claimNextQueued', () => {
    it('returns null when no queued run exists', async () => {
      const repo = makeRunsRepoMock({
        findOne: jest.fn(async (_opts: unknown) => null),
      });

      const { service } = createService(repo);

      await expect(service.claimNextQueued('default', 'worker-1')).resolves.toBeNull();
      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('returns null when update affected != 1 (lost race)', async () => {
      const queued = makeRun({ id: 'r1', chatId: 'c1', queueKey: 'default', status: 'queued' });

      const repo = makeRunsRepoMock({
        findOne: jest.fn(async (_opts: unknown) => queued),
        update: jest.fn(async (_criteria: unknown, _partial: DeepPartial<RunEntity>) => {
          const res: UpdateResult = { affected: 0, raw: [], generatedMaps: [] };
          return res;
        }),
      });

      const { service, publishSpy } = createService(repo);

      await expect(service.claimNextQueued('default', 'worker-1')).resolves.toBeNull();
      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('updates the run to running, emits run.status, and returns fresh snapshot', async () => {
      const queued = makeRun({ id: 'r1', chatId: 'c1', queueKey: 'default', status: 'queued' });
      const running = makeRun({ id: 'r1', chatId: 'c1', queueKey: 'default', status: 'running' });

      let findOneCall = 0;
      const repo = makeRunsRepoMock({
        findOne: jest.fn(async (_opts: unknown) => {
          findOneCall += 1;
          if (findOneCall === 1) return queued; // claim step
          return running; // emitRunStatus + return snapshot
        }),
        update: jest.fn(async (_criteria: unknown, _partial: DeepPartial<RunEntity>) => {
          const res: UpdateResult = { affected: 1, raw: [], generatedMaps: [] };
          return res;
        }),
      });

      const { service, publishSpy } = createService(repo);

      const claimed = await service.claimNextQueued('default', 'worker-1');

      expect(claimed).toBe(running);
      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledTimes(1);

      // publish payload should be a full snapshot
      expect(publishSpy.mock.calls[0]?.[0]).toMatchObject({
        type: 'run.status',
        chatId: 'c1',
        runId: 'r1',
      });
    });
  });

  describe('createQueuedRun', () => {
    it('creates + saves a queued run and emits run.status', async () => {
      const saved = makeRun({
        id: 'r1',
        chatId: 'c1',
        queueKey: 'default',
        status: 'queued',
      });

      const repo = makeRunsRepoMock({
        create: jest.fn((_entityLike: DeepPartial<RunEntity>) => saved),
        save: jest.fn(async (_entity: DeepPartial<RunEntity>) => saved),
        findOne: jest.fn(async (_opts: unknown) => saved), // emitRunStatus reads it back
      });

      const { service, publishSpy } = createService(repo);

      const res = await service.createQueuedRun({
        chatId: 'c1',
        clientRequestId: 'req-1',
        queueKey: 'default',
        settingsSnapshot: { temperature: 0.7 },
        settingsProfileId: null,
        sourceMessageId: null,
        targetMessageId: null,
        headMessageIdAtStart: null,
      });

      expect(res).toBe(saved);
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy.mock.calls[0]?.[0]).toMatchObject({
        type: 'run.status',
        chatId: 'c1',
        runId: 'r1',
      });
    });
  });

  describe('markCompleted', () => {
    it('updates run to completed and emits run.status', async () => {
      const completed = makeRun({
        id: 'r1',
        chatId: 'c1',
        status: 'completed',
      });

      const repo = makeRunsRepoMock({
        update: jest.fn(async (_criteria: unknown, _partial: DeepPartial<RunEntity>) => {
          const res: UpdateResult = { affected: 1, raw: [], generatedMaps: [] };
          return res;
        }),
        findOne: jest.fn(async (_opts: unknown) => completed), // emitRunStatus reads it back
      });

      const { service, publishSpy } = createService(repo);

      await expect(
        service.markCompleted('r1', { stats: { tokens: 123 } }),
      ).resolves.toBeUndefined();

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy.mock.calls[0]?.[0]).toMatchObject({
        type: 'run.status',
        chatId: 'c1',
        runId: 'r1',
      });
    });
  });

  describe('unlockStaleRunning', () => {
    it('returns 0 when no runs are stale', async () => {
      const fresh = makeRun({
        id: 'r1',
        chatId: 'c1',
        status: 'running',
        lockedBy: 'worker-1',
        lockedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const repo = makeRunsRepoMock({
        find: jest.fn(async (_opts?: unknown) => [fresh]),
      });

      const { service, publishSpy } = createService(repo);

      const unlocked = await service.unlockStaleRunning('worker-1', 60_000);
      expect(unlocked).toBe(0);
      expect(repo.update).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('unlocks stale runs and emits run.status for each', async () => {
      // now = 00:00, cutoff = now - staleMs
      const stale = makeRun({
        id: 'r1',
        chatId: 'c1',
        status: 'running',
        lockedBy: 'worker-1',
        lockedAt: new Date('2025-12-31T23:00:00.000Z'),
        updatedAt: new Date('2025-12-31T23:00:00.000Z'),
      });

      const repo = makeRunsRepoMock({
        find: jest.fn(async (_opts?: unknown) => [stale]),
        findOne: jest.fn(async (_opts: unknown) => stale), // emitRunStatus reads it back
      });

      const { service, publishSpy } = createService(repo);

      const unlocked = await service.unlockStaleRunning('worker-1', 10 * 60_000);

      expect(unlocked).toBe(1);
      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy.mock.calls[0]?.[0]).toMatchObject({
        type: 'run.status',
        chatId: 'c1',
        runId: 'r1',
      });
    });
  });
});
