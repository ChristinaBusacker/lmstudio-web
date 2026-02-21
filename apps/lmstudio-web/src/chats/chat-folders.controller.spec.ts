import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FoldersController } from './chat-folders.controller';
import { ChatFoldersService } from './chat-folders.service';
import type { ChatFolderEntity } from './entities/chat-folder.entity';

type ChatFoldersServiceMock = Pick<ChatFoldersService, 'list' | 'create' | 'update' | 'softDelete'>;

describe('FoldersController', () => {
  let controller: FoldersController;
  let folders: jest.Mocked<ChatFoldersServiceMock>;

  beforeEach(async () => {
    folders = {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [FoldersController],
      providers: [{ provide: ChatFoldersService, useValue: folders }],
    }).compile();

    controller = moduleRef.get(FoldersController);
  });

  it('list() maps entities to dtos', async () => {
    const folder: Partial<ChatFolderEntity> = {
      id: 'f1',
      name: 'Inbox',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    };
    folders.list.mockResolvedValue([folder as ChatFolderEntity]);

    const res = await controller.list();
    expect(res).toEqual([
      {
        id: 'f1',
        name: 'Inbox',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        deletedAt: null,
      },
    ]);
  });

  it('create() calls service and returns dto', async () => {
    const folder: Partial<ChatFolderEntity> = {
      id: 'f2',
      name: 'Work',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      deletedAt: null,
    };
    folders.create.mockResolvedValue(folder as ChatFolderEntity);

    const res = await controller.create({ name: 'Work' });
    expect(folders.create).toHaveBeenCalledWith('Work');
    expect(res.id).toBe('f2');
  });

  it('update() throws NotFoundException when service returns null', async () => {
    folders.update.mockResolvedValue(null);
    await expect(controller.update('missing', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('softDelete() throws NotFoundException when folder missing', async () => {
    folders.softDelete.mockResolvedValue({ folder: null, affectedChats: 0 });
    await expect(controller.softDelete('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
