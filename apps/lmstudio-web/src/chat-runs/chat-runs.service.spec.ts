import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatRunsService } from './chat-runs.service';

describe('ChatRunsService', () => {
  const chats = {
    getChat: jest.fn(),
    createUserMessage: jest.fn(),
    createAssistantPlaceholder: jest.fn(),
    ensureAutoTitle: jest.fn(),
    setChatHead: jest.fn(),
  } as any;
  const runs = { createQueuedRun: jest.fn() } as any;
  const settings = { getById: jest.fn(), getDefault: jest.fn() } as any;
  const variants = { createAndActivate: jest.fn() } as any;
  const messages = { getById: jest.fn(), markEdited: jest.fn() } as any;
  const config = { get: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((k: string) => {
      if (k === 'LMSTUDIO_DEFAULT_MODEL') return 'model-default';
      return undefined;
    });
  });

  it('sendAndEnqueue orchestrates messages + head + settings snapshot + queued run', async () => {
    chats.getChat.mockResolvedValue({ id: 'c1', activeHeadMessageId: 'h0' });
    chats.createUserMessage.mockResolvedValue({ id: 'u1', role: 'user' });
    chats.createAssistantPlaceholder.mockResolvedValue({ id: 'a1', role: 'assistant' });
    settings.getDefault.mockResolvedValue({ id: 'p1', params: { temperature: 0.1 } });
    runs.createQueuedRun.mockResolvedValue({ id: 'r1' });

    const svc = new ChatRunsService(chats, runs, settings, variants, messages, config);
    const res = await svc.sendAndEnqueue({
      chatId: 'c1',
      content: ' hello ',
      clientRequestId: 'req-1',
      settingsSnapshot: { topP: 0.5 } as any,
    });

    expect(res).toEqual({ id: 'r1' });
    expect(chats.createUserMessage).toHaveBeenCalledWith({
      chatId: 'c1',
      content: 'hello',
      parentMessageId: 'h0',
    });
    expect(chats.createAssistantPlaceholder).toHaveBeenCalledWith({
      chatId: 'c1',
      parentMessageId: 'u1',
    });
    expect(chats.setChatHead).toHaveBeenCalledWith('c1', 'a1');
    expect(runs.createQueuedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'c1',
        clientRequestId: 'req-1',
        sourceMessageId: 'u1',
        targetMessageId: 'a1',
        headMessageIdAtStart: 'h0',
        settingsProfileId: 'p1',
        settingsSnapshot: expect.objectContaining({
          temperature: 0.1,
          topP: 0.5,
          modelKey: 'model-default',
        }),
      }),
    );
  });

  it('sendAndEnqueue rejects empty content', async () => {
    chats.getChat.mockResolvedValue({ id: 'c1', activeHeadMessageId: null });
    const svc = new ChatRunsService(chats, runs, settings, variants, messages, config);
    await expect(
      svc.sendAndEnqueue({ chatId: 'c1', content: '   ', clientRequestId: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sendAndEnqueue throws NotFound for missing chat', async () => {
    chats.getChat.mockResolvedValue(null);
    const svc = new ChatRunsService(chats, runs, settings, variants, messages, config);
    await expect(
      svc.sendAndEnqueue({ chatId: 'no', content: 'hi', clientRequestId: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('regenerate creates a new active variant and enqueues run with parent user as source', async () => {
    messages.getById
      .mockResolvedValueOnce({
        id: 'a1',
        chatId: 'c1',
        role: 'assistant',
        deletedAt: null,
        parentMessageId: 'u1',
      })
      .mockResolvedValueOnce({ id: 'u1', role: 'user', deletedAt: null });
    settings.getDefault.mockResolvedValue({ id: 'p1', params: { modelKey: 'm1' } });
    runs.createQueuedRun.mockResolvedValue({ id: 'r1' });

    const svc = new ChatRunsService(chats, runs, settings, variants, messages, config);
    const res = await svc.regenerate({ messageId: 'a1', clientRequestId: 'req-2' });

    expect(res).toEqual({ id: 'r1' });
    expect(variants.createAndActivate).toHaveBeenCalledWith({
      messageId: 'a1',
      content: '',
      reasoning: null,
    });
    expect(messages.markEdited).toHaveBeenCalledWith('a1');
    expect(chats.setChatHead).toHaveBeenCalledWith('c1', 'a1');
    expect(runs.createQueuedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'c1',
        clientRequestId: 'req-2',
        sourceMessageId: 'u1',
        targetMessageId: 'a1',
        headMessageIdAtStart: 'a1',
      }),
    );
  });
});
