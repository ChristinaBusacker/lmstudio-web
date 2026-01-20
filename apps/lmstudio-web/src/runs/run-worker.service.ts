/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChatContextBuilder } from '../chats/chat-context.builder';
import { ChatEngineService } from '../chats/chat-engine.service';
import { MessageVariantsService } from '../chats/message-variants.service';
import { normalizeError } from '../common/utils/error.util';
import { parseThinkDelta } from '../common/utils/think-parser';
import { RunsService } from './runs.service';
import { SseBusService } from '../sse/sse-bus.service';

type ThinkState = { inThink: boolean };

interface RunExecContext {
  runId: string;
  chatId: string;
  targetMessageId: string;

  /** Current accumulated content */
  content: string;
  /** Current accumulated reasoning */
  reasoning: string;

  /** Throttling */
  lastFlushMs: number;

  /** Parsing state for <think> */
  think: ThinkState;

  /** Frozen settings snapshot */
  params: Record<string, any>;
}

@Injectable()
export class RunWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunWorkerService.name);

  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  private readonly lockedBy = 'worker-1';
  private readonly queueKey = 'default';

  private readonly POLL_MS = 300;
  private readonly FLUSH_MS = 500;

  constructor(
    private readonly runs: RunsService,
    private readonly contextBuilder: ChatContextBuilder,
    private readonly engine: ChatEngineService,
    private readonly variants: MessageVariantsService,
    private readonly sse: SseBusService,
  ) {}

  onModuleInit() {
    void this.runs.unlockStaleRunning(this.lockedBy, 30_000);
    this.timer = setInterval(() => void this.tick(), this.POLL_MS);
    this.logger.log('Run worker started');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.isTickRunning) return;
    this.isTickRunning = true;

    try {
      const claimed = await this.runs.claimNextQueued(this.queueKey, this.lockedBy);
      if (!claimed) return;

      // We know status is "running" now, emit global+chat-scoped status.
      this.publishRunStatus(claimed.chatId, claimed.id, { status: 'running' });

      this.logger.log(`Claimed run ${claimed.id}`);
      await this.executeRun(claimed.id);
    } catch (err: unknown) {
      const e = normalizeError(err);
      this.logger.error(e.message, e.stack);
    } finally {
      this.isTickRunning = false;
    }
  }

  /**
   * Executes a single run end-to-end:
   * - loads run + target message active variant
   * - builds active chat context
   * - streams from LM Studio
   * - periodically flushes content to DB + emits SSE snapshots
   * - marks run status (completed/failed/canceled) + emits SSE status
   */
  private async executeRun(runId: string) {
    // ctx is local to this call -> no "reset" needed.
    // If executeRun returns, the ctx is garbage collected.
    let ctx: RunExecContext | null = null;

    try {
      ctx = await this.loadContext(runId);

      // If user canceled before we even start, stop cleanly.
      const run = await this.runs.getById(runId);
      if (!run) throw new Error(`Run not found: ${runId}`);
      if (run.status === 'canceled') {
        await this.finalizeCanceled(ctx);
        return;
      }

      await this.consumeStream(ctx);
      // consumeStream will finalize completed/canceled itself.
    } catch (err: unknown) {
      // If we failed before ctx exists, we can only markFailed by runId.
      if (!ctx) {
        const e = normalizeError(err);
        await this.runs.markFailed(runId, e.message);
        this.logger.warn(`Failed run ${runId} before init: ${e.message}`);
        return;
      }

      if (this.isAbortError(err)) {
        await this.finalizeCanceled(ctx);
        return;
      }

      const e = normalizeError(err);
      await this.finalizeFailed(ctx, e.message);
    }
  }

  /**
   * Loads run + target message active variant state and prepares the execution context.
   */
  private async loadContext(runId: string): Promise<RunExecContext> {
    const run = await this.runs.getById(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const targetMessageId = run.targetMessageId;
    if (!targetMessageId) throw new Error(`Run ${runId} has no targetMessageId`);

    const active = await this.variants.getActive(targetMessageId);
    if (!active) throw new Error(`No active variant for target message ${targetMessageId}`);

    return {
      runId,
      chatId: run.chatId,
      targetMessageId,

      content: active.content ?? '',
      reasoning: active.reasoning ?? '',

      lastFlushMs: Date.now(),
      think: { inThink: false },

      params: (run.settingsSnapshot ?? {}) as Record<string, any>,
    };
  }

  /**
   * Main streaming loop: consumes LM Studio stream and flushes snapshots periodically.
   */
  private async consumeStream(ctx: RunExecContext) {
    const systemPrompt = ''; // later: prompt profiles
    const messages = await this.contextBuilder.buildActiveContext(ctx.chatId, systemPrompt);

    const gen = this.engine.streamChat(ctx.runId, messages, ctx.params);

    while (true) {
      const { value, done } = await gen.next();

      if (done) {
        await this.flush(ctx);
        await this.runs.markCompleted(ctx.runId, { stats: value.stats });

        const finalActive = await this.variants.getActive(ctx.targetMessageId);
        if (finalActive) await this.runs.setCreatedVariant(ctx.runId, finalActive.id);

        this.publishRunStatus(ctx.chatId, ctx.runId, {
          status: 'completed',
          stats: (value.stats ?? null) as any,
        });

        this.logger.log(`Completed run ${ctx.runId}`);
        return;
      }

      // Update buffers (split <think> deltas)
      const parsed = parseThinkDelta(value.delta, ctx.think);
      ctx.think = parsed.state;

      if (parsed.contentDelta) ctx.content += parsed.contentDelta;
      if (parsed.reasoningDelta) ctx.reasoning += parsed.reasoningDelta;

      // Throttled flush and cancel check
      if (Date.now() - ctx.lastFlushMs >= this.FLUSH_MS) {
        if (await this.isCanceledInDb(ctx.runId)) {
          this.engine.cancel(ctx.runId);
          await this.flush(ctx);
          await this.finalizeCanceled(ctx);
          return;
        }

        await this.flush(ctx);
        ctx.lastFlushMs = Date.now();
      }
    }
  }

  /**
   * Flush current buffers to DB and emit SSE snapshot.
   * Snapshot is "content so far" for the single target message.
   */
  private async flush(ctx: RunExecContext) {
    await this.variants.appendToActive(ctx.targetMessageId, {
      content: ctx.content,
      reasoning: ctx.reasoning,
    });

    this.sse.publish({
      type: 'variant.snapshot',
      chatId: ctx.chatId,
      runId: ctx.runId,
      messageId: ctx.targetMessageId,
      payload: {
        content: ctx.content,
        reasoning: ctx.reasoning || null,
      },
    });
  }

  private async finalizeCanceled(ctx: RunExecContext) {
    // preserve partial output
    await this.flush(ctx);
    await this.markCanceledIfNotTerminal(ctx.runId);

    this.publishRunStatus(ctx.chatId, ctx.runId, { status: 'canceled' });
    this.logger.log(`Canceled run ${ctx.runId}`);
  }

  private async finalizeFailed(ctx: RunExecContext, message: string) {
    // preserve partial output
    await this.flush(ctx);
    await this.runs.markFailed(ctx.runId, message);

    this.publishRunStatus(ctx.chatId, ctx.runId, { status: 'failed', error: message });
    this.logger.warn(`Failed run ${ctx.runId}: ${message}`);
  }

  private publishRunStatus(
    chatId: string,
    runId: string,
    payload: {
      status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
      error?: string | null;
      stats?: any;
    },
  ) {
    this.sse.publish({
      type: 'run.status',
      chatId,
      runId,
      payload,
    });
  }

  /**
   * Checks cancellation flag in DB.
   * V1 approach (simple): poll DB at flush cadence.
   */
  private async isCanceledInDb(runId: string): Promise<boolean> {
    const latest = await this.runs.getById(runId);
    return latest?.status === 'canceled';
  }

  /**
   * Avoid races: do not overwrite terminal statuses.
   */
  private async markCanceledIfNotTerminal(runId: string) {
    const r = await this.runs.getById(runId);
    if (!r) return;
    if (r.status === 'completed' || r.status === 'failed' || r.status === 'canceled') return;
    await this.runs.markCanceled(runId);
  }

  private isAbortError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as any;
    return e.name === 'AbortError' || e.code === 'ABORT_ERR';
  }
}
