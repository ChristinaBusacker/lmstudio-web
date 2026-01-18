import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RunEntity } from './entities/run.entity';
import type { RunStatus } from './entities/run.types';

@Injectable()
export class RunsService {
  constructor(
    @InjectRepository(RunEntity)
    private readonly runs: Repository<RunEntity>,
  ) {}

  async getById(id: string) {
    return this.runs.findOne({ where: { id } });
  }

  async createQueuedRun(params: {
    chatId: string;
    clientRequestId: string;
    queueKey?: string;

    settingsSnapshot: Record<string, any>;
    settingsProfileId?: string | null;

    sourceMessageId?: string | null;
    targetMessageId?: string | null;
    headMessageIdAtStart?: string | null;
  }) {
    const run = this.runs.create({
      chatId: params.chatId,
      clientRequestId: params.clientRequestId,
      queueKey: params.queueKey ?? 'default',

      status: 'queued',
      settingsSnapshot: params.settingsSnapshot,
      settingsProfileId: params.settingsProfileId ?? null,

      sourceMessageId: params.sourceMessageId ?? null,
      targetMessageId: params.targetMessageId ?? null,
      headMessageIdAtStart: params.headMessageIdAtStart ?? null,

      createdVariantId: null,
      error: null,
      stats: null,
      lockedBy: null,
      lockedAt: null,
      startedAt: null,
      finishedAt: null,
    });

    return this.runs.save(run);
  }

  /**
   * SQLite-friendly claim: optimistic update.
   * Works well when you run exactly ONE worker process.
   */
  async claimNextQueued(queueKey: string, lockedBy: string): Promise<RunEntity | null> {
    const next = await this.runs.findOne({
      where: { queueKey, status: 'queued' as RunStatus },
      order: { createdAt: 'ASC' },
    });
    if (!next) return null;

    const now = new Date();
    const res = await this.runs.update(
      { id: next.id, status: 'queued' as RunStatus },
      { status: 'running', lockedBy, lockedAt: now, startedAt: now },
    );

    if (res.affected !== 1) return null; // lost the race
    return this.runs.findOne({ where: { id: next.id } });
  }

  async appendContent(runId: string, content: string) {
    await this.runs.update({ id: runId }, { content, updatedAt: new Date() as any });
  }

  async markCompleted(runId: string, patch?: { stats?: any; content?: string }) {
    await this.runs.update(
      { id: runId },
      {
        status: 'completed',
        finishedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        ...(patch ?? {}),
      },
    );
  }

  async markFailed(runId: string, errorMessage: string) {
    await this.runs.update(
      { id: runId },
      {
        status: 'failed',
        error: errorMessage,
        finishedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
      },
    );
  }

  async markCanceled(runId: string) {
    await this.runs.update(
      { id: runId },
      { status: 'canceled', finishedAt: new Date(), lockedBy: null, lockedAt: null },
    );
  }

  async setCreatedVariant(runId: string, variantId: string) {
    await this.runs.update({ id: runId }, { createdVariantId: variantId });
  }

  /**
   * Crash recovery light: unlock stale running jobs (optional).
   * For SQLite single-instance, this is mostly for "dev restarts".
   */
  async unlockStaleRunning(lockedBy: string, staleMs: number) {
    const cutoff = new Date(Date.now() - staleMs);
    // SQLite: TypeORM doesn't do date comparison nicely with update criteria across DBs,
    // so we do a small find+update pass.
    const stuck = await this.runs.find({
      where: { status: 'running' as RunStatus, lockedBy },
      order: { updatedAt: 'ASC' },
    });

    const toUnlock = stuck.filter((r) => (r.lockedAt ?? r.startedAt ?? r.updatedAt) < cutoff);
    for (const r of toUnlock) {
      await this.runs.update(
        { id: r.id },
        { status: 'queued', lockedBy: null, lockedAt: null, startedAt: null },
      );
    }
    return toUnlock.length;
  }

  async listByChat(chatId: string, limit = 20) {
    return this.runs.find({
      where: { chatId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async listActive(params?: { queueKey?: string; limit?: number }) {
    const limit = params?.limit ?? 50;
    const queueKey = params?.queueKey ?? 'default';

    return this.runs.find({
      where: {
        queueKey,
        status: In(['queued', 'running'] as any),
      },
      // UX: queued zuerst, dann running, jeweils nach createdAt
      order: { status: 'ASC' as any, createdAt: 'ASC' as any },
      take: limit,
    });
  }

  async listActiveByChat(chatId: string, params?: { queueKey?: string; limit?: number }) {
    const limit = params?.limit ?? 50;
    const queueKey = params?.queueKey ?? 'default';

    return this.runs.find({
      where: {
        chatId,
        queueKey,
        status: In(['queued', 'running'] as any),
      },
      order: { status: 'ASC' as any, createdAt: 'ASC' as any },
      take: limit,
    });
  }
}
