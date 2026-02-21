import { Test } from '@nestjs/testing';
import { ChatRunsController } from './chat-runs.controller';
import { ChatRunsService } from './chat-runs.service';

type ChatRunsServiceMock = Pick<ChatRunsService, 'sendAndEnqueue' | 'regenerate'>;

type RunLike = {
  id: string;
  chatId: string;
  sourceMessageId?: string | null;
  targetMessageId?: string | null;
  headMessageIdAtStart?: string | null;
  queueKey?: string | null;
  status?: string | null;
  createdAt: Date;
};

describe('ChatRunsController', () => {
  let controller: ChatRunsController;
  let chatRuns: jest.Mocked<ChatRunsServiceMock>;

  beforeEach(async () => {
    chatRuns = {
      sendAndEnqueue: jest.fn(),
      regenerate: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ChatRunsController],
      providers: [{ provide: ChatRunsService, useValue: chatRuns }],
    }).compile();

    controller = moduleRef.get(ChatRunsController);
  });

  it('send() passes mapped payload to service and returns stable response shape', async () => {
    const run: RunLike = {
      id: 'r1',
      chatId: 'c1',
      sourceMessageId: 'mUser',
      targetMessageId: 'mAsst',
      headMessageIdAtStart: 'mAsst',
      queueKey: 'default',
      status: 'queued',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    chatRuns.sendAndEnqueue.mockResolvedValue(
      run as unknown as Awaited<ReturnType<ChatRunsService['sendAndEnqueue']>>,
    );

    const res = await controller.send('c1', {
      content: 'hello',
      clientRequestId: 'req-1',
      settingsProfileId: 'p1',
      settingsSnapshot: { modelKey: 'm' },
    });

    expect(chatRuns.sendAndEnqueue).toHaveBeenCalledWith({
      chatId: 'c1',
      content: 'hello',
      clientRequestId: 'req-1',
      settingsProfileId: 'p1',
      settingsSnapshot: { modelKey: 'm' },
    });

    expect(res).toEqual({
      runId: 'r1',
      chatId: 'c1',
      sourceMessageId: 'mUser',
      targetMessageId: 'mAsst',
      headMessageIdAtStart: 'mAsst',
      queueKey: 'default',
      status: 'queued',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('regenerate() passes mapped payload to service and returns stable response shape', async () => {
    const run: RunLike = {
      id: 'r2',
      chatId: 'c2',
      sourceMessageId: 'mUser2',
      targetMessageId: 'mAsst2',
      headMessageIdAtStart: 'mAsst2',
      queueKey: 'default',
      status: 'queued',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    chatRuns.regenerate.mockResolvedValue(
      run as unknown as Awaited<ReturnType<ChatRunsService['regenerate']>>,
    );

    const res = await controller.regenerate('mAsst2', {
      clientRequestId: 'req-2',
      settingsProfileId: 'p2',
    });

    expect(chatRuns.regenerate).toHaveBeenCalledWith({
      messageId: 'mAsst2',
      clientRequestId: 'req-2',
      settingsProfileId: 'p2',
    });

    expect(res.runId).toBe('r2');
    expect(res.chatId).toBe('c2');
  });
});
