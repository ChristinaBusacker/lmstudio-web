/* eslint-disable @typescript-eslint/no-unused-vars */
import { ConfigService } from '@nestjs/config';
import type { ConfigGetOptions } from '@nestjs/config/dist/config.service';
import type { SseEnvelopeOf, SseEventType } from '@shared/contracts';
import type { JsonObject, StreamResult } from '@shared/index';
import { ChatContextBuilder } from '../chats/chat-context.builder';
import { ChatEngineService } from '../chats/chat-engine.service';
import { ChatEntity } from '../chats/entities/chat.entity';
import { MessageVariantEntity } from '../chats/entities/message-variant.entity';
import { MessageVariantsService } from '../chats/message-variants.service';
import type { LmMessage, RunParams, StreamDelta } from '../common/types/llm.types';

import { SseBusService } from '../sse/sse-bus.service';
import { ToolOrchestratorService } from '../tools/tool-orchestrator.service';
import { RunEntity } from './entities/run.entity';
import { RunWorkerService } from './run-worker.service';
import { RunsService } from './runs.service';

async function* makeStream(
  deltas: string[],
  stats?: JsonObject,
): AsyncGenerator<StreamDelta, StreamResult, void> {
  let content = '';
  for (const delta of deltas) {
    content += delta;
    yield { delta };
  }
  return { content, stats };
}

function makeChat(id: string): ChatEntity {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    title: null,
    defaultSettingsProfileId: null,
    createdAt: now,
    updatedAt: now,
    folderId: null,
    activeHeadMessageId: null,
    deletedAt: null,
    sortKey: 0,
    messages: [],
    runs: [],
    folder: null,
  };
}

function makeRun(partial: Partial<RunEntity>): RunEntity {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const chat = partial.chat ?? makeChat(partial.chatId ?? 'c1');

  return {
    id: partial.id ?? 'r1',
    chatId: partial.chatId ?? chat.id,
    chat,
    queueKey: partial.queueKey ?? 'default',
    clientRequestId: partial.clientRequestId ?? '11111111-1111-1111-1111-111111111111',
    status: partial.status ?? 'running',
    settingsProfileId: partial.settingsProfileId ?? null,
    settingsSnapshot: (partial.settingsSnapshot ?? {}) as RunParams,
    promptProfileHash: partial.promptProfileHash ?? null,
    content: partial.content ?? '',
    stats: partial.stats ?? null,
    error: partial.error ?? null,
    lockedBy: partial.lockedBy ?? null,
    lockedAt: partial.lockedAt ?? null,
    startedAt: partial.startedAt ?? now,
    finishedAt: partial.finishedAt ?? null,
    sourceMessageId: partial.sourceMessageId ?? null,
    targetMessageId: partial.targetMessageId ?? 'm_target',
    createdVariantId: partial.createdVariantId ?? null,
    headMessageIdAtStart: partial.headMessageIdAtStart ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe('RunWorkerService', () => {
  test('consumeStream flushes snapshots and marks run completed', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');

    const run = makeRun({
      id: 'r1',
      chatId: 'c1',
      status: 'running',
      settingsSnapshot: { toolsEnabled: false } as unknown as RunParams,
      targetMessageId: 'm1',
      createdAt: now,
      updatedAt: now,
    });

    const activeVariant: MessageVariantEntity = {
      id: 'v1',
      messageId: 'm1',
      message: null as unknown as never,
      variantIndex: 0,
      isActive: true,
      content: '',
      reasoning: null,
      stats: null,
      createdAt: now,
    };

    const runs: Partial<RunsService> = {
      unlockStaleRunning: jest.fn(async (_lockedBy: string, _staleMs: number) => 0),
      claimNextQueued: jest.fn(async (_lockedBy: string) => null),
      getById: jest.fn(async (_id: string) => run),

      // make sure TS infers Promise<void>, not Promise<undefined>
      markCompleted: jest.fn(async (_id: string, _patch: { stats?: unknown }) => {
        return;
      }),
      markFailed: jest.fn(async () => {
        return;
      }),
      markCanceled: jest.fn(async () => {
        return;
      }),
      setCreatedVariant: jest.fn(async () => {
        return;
      }),
    };

    const contextBuilder: Partial<ChatContextBuilder> = {
      buildActiveContext: jest.fn(async (_chatId: string, _system: string) => {
        const msgs: LmMessage[] = [{ role: 'user', content: 'hi' }];
        return msgs;
      }),
    };

    // --- engine stream must be correctly typed (StreamDelta yields + StreamResult return)
    const engineStreamImpl: ChatEngineService['streamChat'] = (_runId, _messages, _params) =>
      makeStream(['Hello ', 'World'], { tokens: 2 });

    const engine: Partial<ChatEngineService> = {
      streamChat: jest.fn(engineStreamImpl),
      cancel: jest.fn(async () => {
        return;
      }),
    };

    const variantsAppendImpl: MessageVariantsService['appendToActive'] = async (
      _messageId,
      _patch,
    ) => null;

    const variants: Partial<MessageVariantsService> = {
      getActive: jest.fn(async (_messageId: string) => activeVariant),
      appendToActive: jest.fn(variantsAppendImpl),
    };

    // --- publish: DON'T wrap generics in jest.fn directly. Use a typed function + collector.
    const published: Array<SseEnvelopeOf<SseEventType>> = [];

    const publish: SseBusService['publish'] = <TType extends SseEventType>(
      event: Omit<SseEnvelopeOf<TType>, 'id' | 'ts'>,
    ): SseEnvelopeOf<TType> => {
      const envelope: SseEnvelopeOf<TType> = {
        ...event,
        id: 1,
        ts: '2026-01-01T00:00:00.000Z',
      };

      published.push(envelope as unknown as SseEnvelopeOf<SseEventType>);
      return envelope;
    };

    const sse: Partial<SseBusService> = { publish };

    const toolStreamImpl: ToolOrchestratorService['streamWithTools'] = (_runId, _msgs, _params) =>
      makeStream(['ignored']);

    const toolOrchestrator: Partial<ToolOrchestratorService> = {
      streamWithTools: jest.fn(toolStreamImpl),
      cancel: jest.fn(async () => {
        return;
      }),
    };

    // --- ConfigService.get has overloads. Implement a safe get and cast once.
    const configGetImpl = <T>(
      _propertyPath: string | symbol,
      defaultOrOptions?: T | ConfigGetOptions,
    ): T | undefined => {
      // options form: return undefined
      if (defaultOrOptions && typeof defaultOrOptions === 'object') return undefined;
      // defaultValue form: return default
      return defaultOrOptions;
    };

    const config: Partial<ConfigService> = {
      get: configGetImpl as unknown as ConfigService['get'],
    };

    const svc = new RunWorkerService(
      runs as RunsService,
      contextBuilder as ChatContextBuilder,
      engine as ChatEngineService,
      variants as MessageVariantsService,
      sse as SseBusService,
      toolOrchestrator as ToolOrchestratorService,
      config as ConfigService,
    );

    const exec = (svc as unknown as { executeRun: (runId: string) => Promise<void> }).executeRun;
    await exec('r1');

    expect(engine.streamChat).toHaveBeenCalled();
    expect(toolOrchestrator.streamWithTools).not.toHaveBeenCalled();

    expect(variants.appendToActive).toHaveBeenCalled();
    expect(runs.markCompleted).toHaveBeenCalledWith('r1', expect.any(Object));

    // publishes snapshots + final run.status
    expect(
      published.some((e) => e.type === 'variant.snapshot' && e.chatId === 'c1' && e.runId === 'r1'),
    ).toBe(true);

    expect(
      published.some((e) => e.type === 'run.status' && e.chatId === 'c1' && e.runId === 'r1'),
    ).toBe(true);
  });
});
