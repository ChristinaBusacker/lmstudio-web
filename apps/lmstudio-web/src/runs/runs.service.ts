/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RunEntity } from './entities/run.entity';
import type { RunStatus } from './entities/run.types';
import { SseBusService } from '../sse/sse-bus.service';

/**
 * RunsService
 *
 * Handles persistence + lifecycle transitions for generation "runs"
 * (queued -> running -> completed/failed/canceled) and publishes SSE updates
 * so the frontend can maintain a live queue view without polling.
 *
 * SSE strategy (V1):
 * - On every meaningful transition, publish a `run.status` event.
 * - Payload contains the full, current run snapshot so the frontend can `upsert`.
 * - DB is always the source of truth; SSE is a live replication stream.
 */
@Injectable()
export class RunsService {
  constructor(
    @InjectRepository(RunEntity)
    private readonly runs: Repository<RunEntity>,
    private readonly sse: SseBusService,
  ) {}

  // --------------------------------------------------------------------------------------------
  // Reads
  // --------------------------------------------------------------------------------------------

  /**
   * Get a run by id.
   */
  async getById(id: string) {
    return this.runs.findOne({ where: { id } });
  }

  /**
   * List recent runs for a chat (newest first).
   */
  async listByChat(chatId: string, limit = 20) {
    return this.runs.find({
      where: { chatId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * List active runs (queued + running) for a queue key.
   * UI-friendly ordering: queued first, then running; oldest first.
   */
  async listActive(params?: { queueKey?: string; limit?: number }) {
    const limit = params?.limit ?? 50;
    const queueKey = params?.queueKey ?? 'default';

    return this.runs.find({
      where: {
        queueKey,
        status: In(['queued', 'running'] as any),
      },
      order: { status: 'ASC' as any, createdAt: 'ASC' as any },
      take: limit,
    });
  }

  /**
   * List active runs (queued + running) for a chat (and queue key).
   */
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

  /**
   * Convenience: check if a run is terminal.
   */
  async isTerminalStatus(runId: string): Promise<boolean> {
    const r = await this.getById(runId);
    if (!r) return false;
    return r.status === 'completed' || r.status === 'failed' || r.status === 'canceled';
  }

  // --------------------------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------------------------

  /**
   * Create a queued run.
   *
   * Publishes:
   * - run.status (queued + full snapshot)
   */
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

    const saved = await this.runs.save(run);
    await this.emitRunStatus(saved.id);
    return saved;
  }

  /**
   * SQLite-friendly claim (optimistic update).
   * Works best when you run ONE worker process.
   *
   * Publishes:
   * - run.status (running + full snapshot)
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

    if (res.affected !== 1) return null; // lost race
    await this.emitRunStatus(next.id);

    return this.runs.findOne({ where: { id: next.id } });
  }

  /**
   * Mark run completed.
   *
   * Publishes:
   * - run.status (completed + full snapshot)
   */
  async markCompleted(runId: string, patch?: { stats?: any }) {
    await this.runs.update(
      { id: runId },
      {
        status: 'completed',
        finishedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
        error: null,
        ...(patch ?? {}),
      },
    );

    await this.emitRunStatus(runId);
  }

  /**
   * Mark run failed with an error message.
   *
   * Publishes:
   * - run.status (failed + full snapshot)
   */
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

    await this.emitRunStatus(runId);
  }

  /**
   * Mark run canceled (terminal).
   *
   * Publishes:
   * - run.status (canceled + full snapshot)
   */
  async markCanceled(runId: string) {
    await this.runs.update(
      { id: runId },
      {
        status: 'canceled',
        finishedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
      },
    );

    await this.emitRunStatus(runId);
  }

  /**
   * Mark canceled only if not already terminal.
   * This avoids races where another process completed the run.
   *
   * Publishes:
   * - run.status (canceled + full snapshot) only if status changed
   */
  async markCanceledIfNotTerminal(runId: string) {
    const run = await this.getById(runId);
    if (!run) return;
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') return;

    await this.markCanceled(runId);
  }

  /**
   * Store the created variant id (useful for linking run -> assistant variant).
   *
   * Publishes:
   * - run.status (same status, but updated createdVariantId)
   */
  async setCreatedVariant(runId: string, variantId: string) {
    await this.runs.update({ id: runId }, { createdVariantId: variantId });
    await this.emitRunStatus(runId);
  }

  /**
   * Crash recovery light: unlock stale "running" jobs created by the same worker instance id.
   * For SQLite single-instance, this is mainly for dev restarts.
   *
   * Publishes:
   * - run.status (queued + snapshot) for each unlocked run
   */
  async unlockStaleRunning(lockedBy: string, staleMs: number) {
    const cutoff = new Date(Date.now() - staleMs);

    const stuck = await this.runs.find({
      where: { status: 'running' as RunStatus, lockedBy },
      order: { updatedAt: 'ASC' },
    });

    const toUnlock = stuck.filter((r) => (r.lockedAt ?? r.startedAt ?? r.updatedAt) < cutoff);

    for (const r of toUnlock) {
      await this.runs.update(
        { id: r.id },
        {
          status: 'queued',
          lockedBy: null,
          lockedAt: null,
          startedAt: null,
          error: null,
          finishedAt: null,
        },
      );

      await this.emitRunStatus(r.id);
    }

    return toUnlock.length;
  }

  // --------------------------------------------------------------------------------------------
  // SSE
  // --------------------------------------------------------------------------------------------

  /**
   * Publish a `run.status` SSE event with the FULL current run snapshot.
   *
   * Frontend expectation:
   * - Upsert payload.run into store
   * - The store becomes the UI queue truth (DB remains the server truth)
   */
  private async emitRunStatus(runId: string) {
    const run = await this.getById(runId);
    if (!run) return;

    this.sse.publish({
      type: 'run.status',
      chatId: run.chatId,
      runId: run.id,
      payload: { run },
    });
  }
}
