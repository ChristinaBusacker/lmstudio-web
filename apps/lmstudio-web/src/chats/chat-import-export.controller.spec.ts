import { Test } from '@nestjs/testing';
import { ChatImportExportController } from './chat-import-export.controller';
import { ChatImportExportService } from './chat-import-export.service';

type ChatImportExportServiceMock = Pick<ChatImportExportService, 'exportChat' | 'importChat'>;

describe('ChatImportExportController', () => {
  let controller: ChatImportExportController;
  let ie: jest.Mocked<ChatImportExportServiceMock>;

  beforeEach(async () => {
    ie = {
      exportChat: jest.fn(),
      importChat: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ChatImportExportController],
      providers: [{ provide: ChatImportExportService, useValue: ie }],
    }).compile();

    controller = moduleRef.get(ChatImportExportController);
  });

  it('export() delegates to service', async () => {
    const bundle = {
      chat: { id: 'c1', title: 't' },
      messages: [],
      variants: [],
    };
    ie.exportChat.mockResolvedValue(
      bundle as unknown as Awaited<ReturnType<ChatImportExportService['exportChat']>>,
    );

    await expect(controller.export('c1')).resolves.toEqual(bundle);
    expect(ie.exportChat).toHaveBeenCalledWith('c1');
  });

  it('import() maps created chat entity to ChatMeta', async () => {
    const chat = {
      id: 'c2',
      title: 'Imported',
      folderId: null,
      activeHeadMessageId: 'm1',
      deletedAt: null,
    };
    ie.importChat.mockResolvedValue(
      chat as unknown as Awaited<ReturnType<ChatImportExportService['importChat']>>,
    );

    const res = await controller.import({
      version: 1,
      title: 'Kannst du das dokument lesen?',
      defaultSettingsProfileId: null,
      activeHeadMessageId: '09e84fac-e007-4c26-a245-985be0a2528c',
      createdAt: '2026-02-16T10:49:41.000Z',
      updatedAt: '2026-02-16T10:49:41.000Z',
      messages: [],
    });
    expect(res).toEqual({
      id: 'c2',
      title: 'Imported',
      folderId: null,
      activeHeadMessageId: 'm1',
      deletedAt: null,
    });
  });
});
