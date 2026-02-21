/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';

import { ChatImportExportService } from './chat-import-export.service';
import { ChatEntity } from './entities/chat.entity';
import { MessageEntity } from './entities/message.entity';
import { MessageVariantEntity } from './entities/message-variant.entity';
import type { ChatExportBundleDto } from './dto/chat-export.dto';

type Trx = {
  create: <T>(cls: new () => T, partial: Partial<T>) => T;
  save: <T>(entity: T) => Promise<T>;
  update: <T>(cls: new () => T, criteria: unknown, partial: Partial<T>) => Promise<unknown>;
  findOneOrFail: <T>(cls: new () => T, opts: unknown) => Promise<T>;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function makeChat(id: string): ChatEntity {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    title: 'Chat',
    defaultSettingsProfileId: null,
    folderId: null,
    sortKey: 0,
    activeHeadMessageId: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  } as unknown as ChatEntity;
}

function makeMsg(id: string, chatId: string, parentMessageId: string | null): MessageEntity {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    chatId,
    role: 'user',
    parentMessageId,
    deletedAt: null,
    editedAt: null,
    createdAt: now,
    updatedAt: now,
  } as unknown as MessageEntity;
}

function makeVar(
  id: string,
  messageId: string,
  idx: number,
  isActive: boolean,
): MessageVariantEntity {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    messageId,
    variantIndex: idx,
    isActive,
    content: `v${idx}`,
    reasoning: null,
    stats: null,
    createdAt: now,
    updatedAt: now,
  } as unknown as MessageVariantEntity;
}

describe('ChatImportExportService', () => {
  it('exportChat throws NotFound if chat does not exist', async () => {
    const chats: Partial<Repository<ChatEntity>> = {
      findOne: jest.fn(async () => null),
    };
    const messages: Partial<Repository<MessageEntity>> = {
      find: jest.fn(),
    };
    const variants: Partial<Repository<MessageVariantEntity>> = {
      find: jest.fn(),
    };

    const svc = new ChatImportExportService(
      chats as Repository<ChatEntity>,
      messages as Repository<MessageEntity>,
      variants as Repository<MessageVariantEntity>,
    );

    await expect(svc.exportChat('c1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exportChat returns bundle with messages + variants grouped per message', async () => {
    const chat = makeChat('c1');
    const m1 = makeMsg('m1', 'c1', null);
    const m2 = makeMsg('m2', 'c1', 'm1');
    const v10 = makeVar('v10', 'm1', 0, true);
    const v20 = makeVar('v20', 'm2', 0, true);
    const v21 = makeVar('v21', 'm2', 1, false);

    const chats: Partial<Repository<ChatEntity>> = {
      findOne: jest.fn(async () => chat),
    };
    const messages: Partial<Repository<MessageEntity>> = {
      find: jest.fn(async () => [m1, m2]),
    };
    const variants: Partial<Repository<MessageVariantEntity>> = {
      find: jest.fn(async () => [v10, v21, v20]),
    };

    const svc = new ChatImportExportService(
      chats as Repository<ChatEntity>,
      messages as Repository<MessageEntity>,
      variants as Repository<MessageVariantEntity>,
    );

    const out = await svc.exportChat('c1');

    expect(out.version).toBe(1);
    expect(out.title).toBe('Chat');
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0]!.id).toBe('m1');
    expect(out.messages[0]!.variants.map((v) => v.id)).toEqual(['v10']);
    expect(out.messages[1]!.id).toBe('m2');
    // variants should be ordered by variantIndex ASC
    expect(out.messages[1]!.variants.map((v) => v.id)).toEqual(['v20', 'v21']);
  });

  it('importChat rejects unsupported versions and empty bundles', async () => {
    const chats: Partial<Repository<ChatEntity>> = { manager: { transaction: jest.fn() } };
    const messages: Partial<Repository<MessageEntity>> = {};
    const variants: Partial<Repository<MessageVariantEntity>> = {};

    const svc = new ChatImportExportService(
      chats as Repository<ChatEntity>,
      messages as Repository<MessageEntity>,
      variants as Repository<MessageVariantEntity>,
    );

    await expect(
      svc.importChat({ version: 2 } as unknown as ChatExportBundleDto),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      svc.importChat({ version: 1, messages: [] } as unknown as ChatExportBundleDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('importChat creates new messages, patches parent ids, and normalizes variants', async () => {
    const bundle: ChatExportBundleDto = {
      version: 1,
      title: 'Imported',
      defaultSettingsProfileId: null,
      activeHeadMessageId: 'old2',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      messages: [
        {
          id: 'old1',
          role: 'user',
          parentMessageId: null,
          deletedAt: null,
          editedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          variants: [],
        },
        {
          id: 'old2',
          role: 'assistant',
          parentMessageId: 'old1',
          deletedAt: null,
          editedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          variants: [
            {
              id: 'v1',
              variantIndex: 0,
              isActive: false,
              content: 'a',
              reasoning: null,
              stats: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
            {
              id: 'v2',
              variantIndex: 1,
              isActive: false,
              content: 'b',
              reasoning: null,
              stats: null,
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    };

    const savedChat = makeChat('newChat');
    const newMsg1 = makeMsg('new1', 'newChat', null);
    const newMsg2 = makeMsg('new2', 'newChat', null);

    const created: Array<{ cls: string; partial: unknown }> = [];
    const updates: Array<{ cls: string; criteria: unknown; partial: unknown }> = [];

    let lastCreateCls = '';
    let messageSaveCount = 0;
    let variantSaveCount = 0;

    const trx: Trx = {
      create: <T>(cls: new () => T, partial: Partial<T>): T => {
        lastCreateCls = cls.name;
        created.push({ cls: cls.name, partial });
        return { ...(partial as object) } as T;
      },
      save: async <T>(entity: T): Promise<T> => {
        if (lastCreateCls === ChatEntity.name) {
          return savedChat as unknown as T;
        }

        if (lastCreateCls === MessageEntity.name) {
          messageSaveCount += 1;
          return (messageSaveCount === 1 ? newMsg1 : newMsg2) as unknown as T;
        }

        if (lastCreateCls === MessageVariantEntity.name) {
          variantSaveCount += 1;
          // attach a deterministic id if the object supports it
          if (isRecord(entity) && typeof entity.id !== 'string') {
            entity.id = `newVar${variantSaveCount}`;
          }
          return entity;
        }

        return entity;
      },
      update: async <T>(
        cls: new () => T,
        criteria: unknown,
        partial: Partial<T>,
      ): Promise<unknown> => {
        updates.push({ cls: cls.name, criteria, partial });
        return { affected: 1 };
      },
      findOneOrFail: async <T>(_cls: new () => T): Promise<T> => savedChat as unknown as T,
    };

    const chats: Partial<Repository<ChatEntity>> = {
      manager: {
        transaction: async <T>(fn: (trxArg: Trx) => Promise<T>): Promise<T> => fn(trx),
      },
    };
    const messages: Partial<Repository<MessageEntity>> = {};
    const variants: Partial<Repository<MessageVariantEntity>> = {};

    const svc = new ChatImportExportService(
      chats as Repository<ChatEntity>,
      messages as Repository<MessageEntity>,
      variants as Repository<MessageVariantEntity>,
    );

    const out = await svc.importChat(bundle);
    expect(out.id).toBe('newChat');

    // Parent patching should update new2 to point to new1
    const parentUpdates = updates.filter((u) => u.cls === MessageEntity.name);
    expect(parentUpdates).toHaveLength(2);

    const updateForNew2 = parentUpdates.find(
      (u) => isRecord(u.criteria) && u.criteria.id === 'new2',
    );
    expect(updateForNew2).toBeTruthy();
    expect(isRecord(updateForNew2?.partial) ? updateForNew2?.partial.parentMessageId : null).toBe(
      'new1',
    );

    // Should set active head based on id map (old2 -> new2)
    const headUpdate = updates.find((u) => u.cls === ChatEntity.name);
    expect(headUpdate).toBeTruthy();
    expect(isRecord(headUpdate?.partial) ? headUpdate?.partial.activeHeadMessageId : null).toBe(
      'new2',
    );

    // When no variants are active, importer normalizes to last variant active,
    // and ensures at least one variant exists for message with empty variants.
    const createdVariantEntities = created.filter((c) => c.cls === MessageVariantEntity.name);
    expect(createdVariantEntities.length).toBeGreaterThanOrEqual(3);
  });
});
