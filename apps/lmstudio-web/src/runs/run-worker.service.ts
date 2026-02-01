/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChatContextBuilder } from '../chats/chat-context.builder';
import { ChatEngineService } from '../chats/chat-engine.service';
import { MessageVariantsService } from '../chats/message-variants.service';
import { normalizeError } from '../common/utils/error.util';
import {
  createThinkParseState,
  parseThinkDelta,
  ThinkParseState,
} from '../common/utils/think-parser';
import { RunsService } from './runs.service';
import { SseBusService } from '../sse/sse-bus.service';

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

  /** Parsing state for think/analysis markers */
  think: ThinkParseState;

  /** Frozen settings snapshot */
  params: Record<string, any>;

  /** One-time debug flag to avoid spamming logs */
  didLogEngineShape: boolean;
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

  private async executeRun(runId: string) {
    let ctx: RunExecContext | null = null;

    try {
      ctx = await this.loadContext(runId);

      const run = await this.runs.getById(runId);
      if (!run) throw new Error(`Run not found: ${runId}`);
      if (run.status === 'canceled') {
        await this.finalizeCanceled(ctx);
        return;
      }

      await this.consumeStream(ctx);
    } catch (err: unknown) {
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
      think: createThinkParseState(),

      params: (run.settingsSnapshot ?? {}) as Record<string, any>,
      didLogEngineShape: false,
    };
  }

  /**
   * Extract "content delta" and any "reasoning delta" that might come in a separate channel.
   * This is intentionally defensive because different model servers encode this differently.
   */
  private extractDeltas(value: any): { contentDelta: string; reasoningDelta: string } {
    let contentDelta = '';
    let reasoningDelta = '';

    // Most common: value.delta is a string
    if (typeof value?.delta === 'string') {
      contentDelta = value.delta;
    }

    // Sometimes: value.delta is an object (OpenAI-ish / custom)
    // e.g. delta: { content: "...", reasoning: "..." }
    if (value?.delta && typeof value.delta === 'object') {
      if (typeof value.delta.content === 'string') contentDelta = value.delta.content;
      if (typeof value.delta.reasoning === 'string') reasoningDelta = value.delta.reasoning;
      if (typeof value.delta.thinking === 'string') reasoningDelta = value.delta.thinking;
      if (typeof value.delta.analysis === 'string') reasoningDelta = value.delta.analysis;
    }

    // Alternative separate keys we might see
    if (typeof value?.reasoningDelta === 'string') reasoningDelta = value.reasoningDelta;
    if (typeof value?.thinkingDelta === 'string') reasoningDelta = value.thinkingDelta;

    if (typeof value?.reasoning === 'string') reasoningDelta = value.reasoning;
    if (typeof value?.thinking === 'string') reasoningDelta = value.thinking;
    if (typeof value?.analysis === 'string') reasoningDelta = value.analysis;

    // Some servers: message: { content: "...", reasoning: "..." } per tick
    if (value?.message && typeof value.message === 'object') {
      if (!contentDelta && typeof value.message.content === 'string')
        contentDelta = value.message.content;
      if (!reasoningDelta && typeof value.message.reasoning === 'string')
        reasoningDelta = value.message.reasoning;
      if (!reasoningDelta && typeof value.message.thinking === 'string')
        reasoningDelta = value.message.thinking;
      if (!reasoningDelta && typeof value.message.analysis === 'string')
        reasoningDelta = value.message.analysis;
    }

    return { contentDelta, reasoningDelta };
  }

  private async consumeStream(ctx: RunExecContext) {
    const systemPrompt = ctx.params.systemPrompt || '';

    const messages = await this.contextBuilder.buildActiveContext(
      ctx.chatId,
      systemPrompt as string,
    );

    const gen = this.engine.streamChat(ctx.runId, messages, ctx.params);

    while (true) {
      const { value, done } = await gen.next();

      if (done) {
        await this.flush(ctx);
        await this.runs.markCompleted(ctx.runId, { stats: value?.stats });

        const finalActive = await this.variants.getActive(ctx.targetMessageId);
        if (finalActive) await this.runs.setCreatedVariant(ctx.runId, finalActive.id);

        this.publishRunStatus(ctx.chatId, ctx.runId, {
          status: 'completed',
          stats: value?.stats ?? null,
        });

        this.logger.log(`Completed run ${ctx.runId}`);
        return;
      }

      // One-time “shape” log so you can SEE what the engine is producing.
      // This answers: "reasoning in-band (delta text) vs out-of-band (other keys)".
      if (!ctx.didLogEngineShape) {
        const keys = value && typeof value === 'object' ? Object.keys(value) : [];
        const deltaType = typeof value?.delta;
        this.logger.log(
          `Engine event shape: keys=[${keys.join(', ')}], typeof(delta)=${deltaType}`,
        );
        ctx.didLogEngineShape = true;
      }

      const { contentDelta, reasoningDelta } = this.extractDeltas(value);

      // 1) Out-of-band reasoning channel: forward it as-is (ChatGPT-like "reasoning" field)
      if (reasoningDelta) {
        ctx.reasoning += reasoningDelta;
      }

      // 2) In-band reasoning markers inside content: parse them out
      if (contentDelta) {
        // Debug only if it contains likely markers
        if (
          contentDelta.includes('<') ||
          contentDelta.includes('```') ||
          contentDelta.includes('Reasoning:') ||
          contentDelta.includes('Analysis:')
        ) {
          this.logger.debug(
            `RAW CONTENT DELTA (markers?): ${JSON.stringify(contentDelta).slice(0, 800)}`,
          );
        }

        const parsed = parseThinkDelta(contentDelta, ctx.think);
        ctx.think = parsed.state;

        if (parsed.contentDelta) ctx.content += parsed.contentDelta;
        if (parsed.reasoningDelta) ctx.reasoning += parsed.reasoningDelta;
      }

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
    await this.flush(ctx);
    await this.markCanceledIfNotTerminal(ctx.runId);

    this.publishRunStatus(ctx.chatId, ctx.runId, { status: 'canceled' });
    this.logger.log(`Canceled run ${ctx.runId}`);
  }

  private async finalizeFailed(ctx: RunExecContext, message: string) {
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

  private async isCanceledInDb(runId: string): Promise<boolean> {
    const latest = await this.runs.getById(runId);
    return latest?.status === 'canceled';
  }

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
