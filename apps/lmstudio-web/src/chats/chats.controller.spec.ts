import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatsController } from './chats.controller';
import type { ChatsService } from './chats.service';
import type { ChatThreadQueryService } from './chat-thread-query.service';
import type { ChatBranchingService } from './chat-branching.service';
import type { ChatForkService } from './chat-fork.service';
import type { ChatFoldersService } from './chat-folders.service';
import type { ChatEntity } from './entities/chat.entity';

describe('ChatsController', () => {
  function mkController(seed?: {
    chats?: Partial<ChatsService>;
    folders?: Partial<ChatFoldersService>;
  }) {
    const chats = {
      listChats: jest.fn(async () => [] as ChatEntity[]),
      getChat: jest.fn(async () => null as ChatEntity | null),
      createChat: jest.fn(),
      renameChat: jest.fn(),
      softDeleteChat: jest.fn(),
      reorderChat: jest.fn(),
      ...(seed?.chats ?? {}),
    } as unknown as ChatsService;

    const thread = { getThread: jest.fn() } as unknown as ChatThreadQueryService;
    const branching = { activateHead: jest.fn() } as unknown as ChatBranchingService;
    const fork = { forkChat: jest.fn() } as unknown as ChatForkService;
    const folders = {
      moveChat: jest.fn(async () => true),
      ...(seed?.folders ?? {}),
    } as unknown as ChatFoldersService;

    return {
      controller: new ChatsController(chats, thread, branching, fork, folders),
      chats,
      folders,
    };
  }

  it('list maps entity dates to ISO strings and normalizes nullables', async () => {
    const createdAt = new Date('2025-01-01T00:00:00.000Z');
    const updatedAt = new Date('2025-01-02T00:00:00.000Z');

    const { controller } = mkController({
      chats: {
        listChats: jest.fn(async () => [
          {
            id: 'c1',
            title: null,
            folderId: null,
            activeHeadMessageId: null,
            defaultSettingsProfileId: null,
            deletedAt: null,
            createdAt,
            updatedAt,
          } as unknown as ChatEntity,
        ]),
      },
    });

    const res = await controller.list({
      limit: 10,
      cursor: undefined,
      folderId: undefined,
      includeDeleted: false,
    });
    expect(res).toEqual([
      {
        id: 'c1',
        title: null,
        folderId: null,
        activeHeadMessageId: null,
        defaultSettingsProfileId: null,
        deletedAt: null,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    ]);
  });

  it('rename throws NotFound when chat does not exist', async () => {
    const { controller } = mkController({
      chats: { getChat: jest.fn(async () => null) },
    });

    await expect(controller.rename('c1', { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('moveChat throws NotFound when chat does not exist', async () => {
    const { controller } = mkController({
      chats: { getChat: jest.fn(async () => null) },
    });
    await expect(controller.moveChat('c1', { folderId: 'f1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('moveChat throws BadRequest when folder service says false', async () => {
    const { controller } = mkController({
      chats: { getChat: jest.fn(async () => ({ id: 'c1' }) as ChatEntity) },
      folders: { moveChat: jest.fn(async () => false) },
    });
    await expect(controller.moveChat('c1', { folderId: 'missing' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reorder throws NotFound when chat does not exist', async () => {
    const { controller } = mkController({
      chats: { getChat: jest.fn(async () => null) },
    });
    await expect(
      controller.reorder('c1', { beforeId: null, afterId: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
