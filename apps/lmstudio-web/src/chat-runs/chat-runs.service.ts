/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatsService } from '../chats/chats.service';
import { RunsService } from '../runs/runs.service';
import { SettingsService } from '../settings/settings.service';
import { MessageVariantsService } from '../chats/message-variants.service';
import { MessagesService } from '../chats/messages.service';
import { ConfigService } from '@nestjs/config';

/**
 * Orchestrates "chat actions" that span multiple domains:
 * - Chats/Messages/Variants (conversation state)
 * - Settings (profile + overrides => frozen snapshot)
 * - Runs (queueable background execution)
 *
 * This service intentionally contains use-case logic (not pure CRUD).
 *
 * Design goals:
 * - DRY settings resolution (hard defaults + default profile + optional overrides)
 * - Reproducible runs by persisting a frozen settingsSnapshot on the RunEntity
 * - Correct regenerate semantics (assistant target, parent user source)
 * - Clean, HTTP-friendly errors (Nest exceptions)
 */
@Injectable()
export class ChatRunsService {
  constructor(
    private readonly chats: ChatsService,
    private readonly runs: RunsService,
    private readonly settings: SettingsService,
    private readonly variants: MessageVariantsService,
    private readonly messages: MessagesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Hard defaults are applied first and can be overridden by:
   * 1) settings profile params (default profile if none given)
   * 2) per-request settingsSnapshot overrides (send only)
   *
   * NOTE: modelKey must always be present (env fallback is allowed).
   */
  private getHardDefaults(): Record<string, any> {
    return {
      temperature: 0.7,
      maxTokens: 800,
      topP: 0.9,
      modelKey: this.config.get<string>('LMSTUDIO_DEFAULT_MODEL') ?? undefined,
    };
  }

  /**
   * Merges two settings objects. Later keys override earlier keys.
   */
  private mergeSettings(
    base: Record<string, any>,
    override?: Record<string, any>,
  ): Record<string, any> {
    return { ...base, ...(override ?? {}) };
  }

  /**
   * Resolves and validates the effective settings snapshot for a run.
   *
   * Resolution order:
   * - hard defaults
   * - profile params (explicit profileId OR default('default'))
   * - optional per-request overrides
   *
   * @throws BadRequestException if modelKey is missing after resolution
   */
  private async resolveSettingsSnapshot(params: {
    settingsProfileId?: string;
    settingsSnapshotOverride?: Record<string, any>;
  }): Promise<{ snapshot: Record<string, any>; profileId: string | null }> {
    const hardDefaults = this.getHardDefaults();

    const profile = params.settingsProfileId
      ? await this.settings.getById(params.settingsProfileId)
      : await this.settings.getDefault('default');

    const withProfile = this.mergeSettings(
      hardDefaults,
      (profile?.params ?? {}) as Record<string, any>,
    );

    const effectiveSnapshot = this.mergeSettings(withProfile, params.settingsSnapshotOverride);

    if (!effectiveSnapshot.modelKey) {
      throw new BadRequestException(
        'No modelKey provided. Set LMSTUDIO_DEFAULT_MODEL or pass settingsProfileId/settingsSnapshot.modelKey.',
      );
    }

    return { snapshot: effectiveSnapshot, profileId: profile?.id ?? null };
  }

  /**
   * Sends a user message, creates an assistant placeholder (target),
   * moves the chat head to the assistant placeholder, and enqueues a run.
   *
   * The run is durable and can be processed even if the client disconnects.
   *
   * @param params.chatId Target chat
   * @param params.content User-visible input content
   * @param params.clientRequestId Idempotency key provided by client
   * @param params.settingsProfileId Optional settings profile to use (otherwise default)
   * @param params.settingsSnapshot Optional per-request overrides (merged last)
   */
  async sendAndEnqueue(params: {
    chatId: string;
    content: string;
    clientRequestId: string;
    settingsProfileId?: string;
    settingsSnapshot?: Record<string, any>;
  }) {
    const chat = await this.chats.getChat(params.chatId);
    if (!chat) throw new NotFoundException(`Chat not found: ${params.chatId}`);

    const trimmed = (params.content ?? '').trim();
    if (!trimmed) throw new BadRequestException('content must not be empty');

    // The new user message is attached to the current active head (branching point).
    const parentId = chat.activeHeadMessageId ?? null;

    // 1) create user message node + active variant
    const userMsg = await this.chats.createUserMessage({
      chatId: params.chatId,
      content: trimmed,
      parentMessageId: parentId,
    });

    await this.chats.ensureAutoTitle(params.chatId, trimmed);

    // 2) create assistant placeholder node + empty active variant (run target)
    const assistantMsg = await this.chats.createAssistantPlaceholder({
      chatId: params.chatId,
      parentMessageId: userMsg.id,
    });

    // 3) move active head to assistant placeholder
    await this.chats.setChatHead(params.chatId, assistantMsg.id);

    // 4) resolve frozen settings snapshot (server-owned)
    const { snapshot, profileId } = await this.resolveSettingsSnapshot({
      settingsProfileId: params.settingsProfileId,
      settingsSnapshotOverride: params.settingsSnapshot,
    });

    // 5) create queued run (IMPORTANT: source + target)
    return this.runs.createQueuedRun({
      chatId: params.chatId,
      clientRequestId: params.clientRequestId,
      settingsSnapshot: snapshot,
      settingsProfileId: profileId,

      sourceMessageId: userMsg.id,
      targetMessageId: assistantMsg.id,
      headMessageIdAtStart: parentId,
    });
  }

  /**
   * Regenerates an assistant message by:
   * - creating a NEW active variant (empty) on the SAME assistant message (Option A)
   * - setting the chat head to that assistant message
   * - enqueueing a run where:
   *   - sourceMessageId = parent user message id
   *   - targetMessageId = assistant message id
   *
   * This ensures the worker writes into the currently active variant.
   *
   * @throws NotFoundException if message does not exist
   * @throws BadRequestException if message is not an assistant message
   * @throws BadRequestException if parent user message is missing/invalid
   */
  async regenerate(params: {
    messageId: string;
    clientRequestId: string;
    settingsProfileId?: string;
  }) {
    const msg = await this.messages.getById(params.messageId);
    if (!msg) throw new NotFoundException(`Message not found: ${params.messageId}`);
    if (msg.deletedAt) throw new BadRequestException('Cannot regenerate a deleted message');
    if (msg.role !== 'assistant') {
      throw new BadRequestException('Can only regenerate assistant messages');
    }

    // Parent must exist and must be a user message (your Run model expects this).
    if (!msg.parentMessageId) {
      throw new BadRequestException('Assistant message has no parent user message');
    }

    const parent = await this.messages.getById(msg.parentMessageId);
    if (!parent) throw new BadRequestException('Parent message not found');
    if (parent.deletedAt) throw new BadRequestException('Parent user message is deleted');
    if (parent.role !== 'user') {
      throw new BadRequestException('Parent of assistant message must be a user message');
    }

    // New active variant becomes the output target (empty content/reasoning).
    await this.variants.createAndActivate({
      messageId: msg.id,
      content: '',
      reasoning: null,
    });

    // Mark message as edited (variant changed).
    await this.messages.markEdited(msg.id);

    // Keep chat head on this assistant message (makes active context consistent).
    await this.chats.setChatHead(msg.chatId, msg.id);

    // Resolve frozen settings snapshot (server-owned, no per-request overrides here).
    const { snapshot, profileId } = await this.resolveSettingsSnapshot({
      settingsProfileId: params.settingsProfileId,
      settingsSnapshotOverride: undefined,
    });

    // IMPORTANT: sourceMessageId is the parent USER message.
    const sourceMessageId = parent.id;

    return this.runs.createQueuedRun({
      chatId: msg.chatId,
      clientRequestId: params.clientRequestId,
      settingsSnapshot: snapshot,
      settingsProfileId: profileId,

      sourceMessageId,
      targetMessageId: msg.id,

      // For regenerate, the "context head" at start is the assistant message itself
      // because we explicitly set it before enqueuing.
      headMessageIdAtStart: msg.id,
    });
  }
}
