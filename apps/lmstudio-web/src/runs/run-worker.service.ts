import { ChatContextBuilder } from '../chats/chat-context.builder';
import { ChatEngineService } from '../chats/chat-engine.service';
import { normalizeError } from '../common/utils/error.util';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MessageVariantsService } from '../chats/message-variants.service';
import { parseThinkDelta } from '../common/utils/think-parser';
import { RunsService } from './runs.service';

@Injectable()
export class RunWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunWorkerService.name);

  private timer: NodeJS.Timeout | null = null;
  private isTickRunning = false;

  private readonly lockedBy = 'worker-1'; // later: instance id
  private readonly queueKey = 'default'; // later: per user or multiple queues

  onModuleInit() {
    // Optional: recover from dev restarts
    void this.runs.unlockStaleRunning(this.lockedBy, 30_000);

    // poll loop
    this.timer = setInterval(() => void this.tick(), 300);
    this.logger.log('Run worker started');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  constructor(
    private readonly runs: RunsService,
    private readonly contextBuilder: ChatContextBuilder,
    private readonly engine: ChatEngineService,
    private readonly variants: MessageVariantsService, // <-- neu
  ) {}

  private async tick() {
    if (this.isTickRunning) return;
    this.isTickRunning = true;

    try {
      const run = await this.runs.claimNextQueued(this.queueKey, this.lockedBy);
      if (!run) return;

      this.logger.log(`Claimed run ${run.id}`);
      await this.executeRun(run.id, run.chatId);
    } catch (err: unknown) {
      const e = normalizeError(err);
      this.logger.error(e.message, e.stack);
    } finally {
      this.isTickRunning = false;
    }
  }

  /**
   * v1: dummy execution to prove the pipeline.
   * Next step: call LM Studio SDK streaming here.
   */
  private async executeRun(runId: string, chatId: string) {
    try {
      const run = await this.runs.getById(runId);
      if (!run) throw new Error(`Run not found: ${runId}`);

      const targetMessageId = run.targetMessageId;
      if (!targetMessageId) throw new Error(`Run ${runId} has no targetMessageId`);

      const systemPrompt = ''; // später PromptProfile
      const messages = await this.contextBuilder.buildActiveContext(chatId, systemPrompt);

      const params = run.settingsSnapshot ?? {};
      console.log(params);
      const gen = this.engine.streamChat(runId, messages, params);

      // current persisted state
      const active = await this.variants.getActive(targetMessageId);
      if (!active) throw new Error(`No active variant for target message ${targetMessageId}`);

      let contentBuffer = active.content ?? '';
      let reasoningBuffer = active.reasoning ?? '';

      let lastFlush = Date.now();
      const FLUSH_MS = 500;

      let state = { inThink: false };

      while (true) {
        const { value, done } = await gen.next();

        if (done) {
          // final flush (content already accumulated)
          await this.variants.appendToActive(targetMessageId, {
            content: contentBuffer,
            reasoning: reasoningBuffer,
          });

          await this.runs.markCompleted(runId, { stats: value.stats });

          // Optional: if du createdVariantId tracken willst:
          const finalActive = await this.variants.getActive(targetMessageId);
          if (finalActive) await this.runs.setCreatedVariant(runId, finalActive.id);

          this.logger.log(`Completed run ${runId}`);
          break;
        }

        // delta parse: split <think>...</think>
        const parsed = parseThinkDelta(value.delta, state);
        state = parsed.state;

        if (parsed.contentDelta) contentBuffer += parsed.contentDelta;
        if (parsed.reasoningDelta) reasoningBuffer += parsed.reasoningDelta;

        if (Date.now() - lastFlush >= FLUSH_MS) {
          await this.variants.appendToActive(targetMessageId, {
            content: contentBuffer,
            reasoning: reasoningBuffer,
          });
          lastFlush = Date.now();
        }
      }
    } catch (err: unknown) {
      const e = normalizeError(err);
      await this.runs.markFailed(runId, e.message);
      this.logger.warn(`Failed run ${runId}: ${e.message}`);
    }
  }
}
