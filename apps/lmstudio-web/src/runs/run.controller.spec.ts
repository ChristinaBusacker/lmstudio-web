/* eslint-disable @typescript-eslint/no-unused-vars */
import { RunsController } from './run.controller';
import { RunsService } from './runs.service';
import { ChatEngineService } from '../chats/chat-engine.service';
import { ToolOrchestratorService } from '../tools/tool-orchestrator.service';
import { RunEntity } from './entities/run.entity';
import { ChatEntity } from '../chats/entities/chat.entity';

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
    status: partial.status ?? 'queued',
    settingsProfileId: partial.settingsProfileId ?? null,
    settingsSnapshot: partial.settingsSnapshot ?? {},
    promptProfileHash: partial.promptProfileHash ?? null,
    content: partial.content ?? '',
    stats: partial.stats ?? null,
    error: partial.error ?? null,
    lockedBy: partial.lockedBy ?? null,
    lockedAt: partial.lockedAt ?? null,
    startedAt: partial.startedAt ?? null,
    finishedAt: partial.finishedAt ?? null,
    sourceMessageId: partial.sourceMessageId ?? null,
    targetMessageId: partial.targetMessageId ?? null,
    createdVariantId: partial.createdVariantId ?? null,
    headMessageIdAtStart: partial.headMessageIdAtStart ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe('RunsController', () => {
  test('listActive sorts queued before running, then by createdAt', async () => {
    const r1 = makeRun({
      id: 'r1',
      status: 'running',
      createdAt: new Date('2026-01-01T00:00:02Z'),
    });
    const r2 = makeRun({ id: 'r2', status: 'queued', createdAt: new Date('2026-01-01T00:00:03Z') });
    const r3 = makeRun({ id: 'r3', status: 'queued', createdAt: new Date('2026-01-01T00:00:01Z') });

    const runs: Partial<RunsService> = {
      listActive: jest.fn(async () => [r1, r2, r3]),
    };

    const engine: Partial<ChatEngineService> = { cancel: jest.fn() };
    const tools: Partial<ToolOrchestratorService> = { cancel: jest.fn() };

    const controller = new RunsController(
      runs as RunsService,
      engine as ChatEngineService,
      tools as ToolOrchestratorService,
    );

    const out = await controller.listActive({ queueKey: 'default', limit: 50 });

    expect(out.map((x) => x.id)).toEqual(['r3', 'r2', 'r1']);
  });

  test('cancel best-effort aborts and marks canceled for running run', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const run = makeRun({ id: 'r1', status: 'running', updatedAt: now });

    const runs: Partial<RunsService> = {
      getById: jest.fn(async (_id: string) => run),
      markCanceled: jest.fn(async (_id: string) => undefined),
    };

    const engine: Partial<ChatEngineService> = { cancel: jest.fn() };
    const tools: Partial<ToolOrchestratorService> = { cancel: jest.fn() };

    const controller = new RunsController(
      runs as RunsService,
      engine as ChatEngineService,
      tools as ToolOrchestratorService,
    );

    await controller.cancel('r1');

    expect(engine.cancel).toHaveBeenCalledWith('r1');
    expect(tools.cancel).toHaveBeenCalledWith('r1');
    expect(runs.markCanceled).toHaveBeenCalledWith('r1');
  });
});
