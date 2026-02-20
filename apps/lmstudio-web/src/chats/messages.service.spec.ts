import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { createMockRepo } from '../../test/utils/mock-repo';
import type { MessageEntity } from './entities/message.entity';
import type { ChatsService } from './chats.service';
import type { SseBusService } from '../sse/sse-bus.service';

type Published = Parameters<SseBusService['publish']>[0];

describe('MessagesService', () => {
  const mkSse = () =>
    ({
      publish: jest.fn((e: Published) => ({ ...e, id: 1, ts: new Date().toISOString() })),
    }) as unknown as SseBusService;

  it('softDeleteMessage throws NotFound for unknown message', async () => {
    const repo = createMockRepo<MessageEntity>();
    const chats = { getChat: jest.fn() } as unknown as ChatsService;
    const svc = new MessagesService(repo as unknown as never, chats, mkSse());

    await expect(svc.softDeleteMessage('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('softDeleteMessage repairs chat head when deleting active head', async () => {
    const repo = createMockRepo<MessageEntity>({
      findOne: jest.fn(async (opts?: unknown) => {
        const id = (opts as { where?: { id?: string } })?.where?.id;
        if (id === 'm1')
          return {
            id: 'm1',
            chatId: 'c1',
            parentMessageId: 'm0',
            deletedAt: null,
          } as MessageEntity;
        return null;
      }),
    });

    const chats = {
      getChat: jest.fn(async () => ({ id: 'c1', activeHeadMessageId: 'm1' })),
      setChatHead: jest.fn(async () => undefined),
    } as unknown as ChatsService;

    const sse = mkSse();
    const svc = new MessagesService(repo as unknown as never, chats, sse);

    const res = await svc.softDeleteMessage('m1');

    expect(repo.update).toHaveBeenCalledWith({ id: 'm1' }, { deletedAt: expect.any(Date) });
    expect(chats.setChatHead).toHaveBeenCalledWith('c1', 'm0');
    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chat.thread.changed', chatId: 'c1' }),
    );
    expect(res.messageId).toBe('m1');
  });

  it('listActiveChain walks parents and skips deleted messages', async () => {
    const byId: Record<string, MessageEntity> = {
      m2: { id: 'm2', chatId: 'c1', parentMessageId: 'm1', deletedAt: null } as MessageEntity,
      m1: { id: 'm1', chatId: 'c1', parentMessageId: 'm0', deletedAt: new Date() } as MessageEntity,
      m0: { id: 'm0', chatId: 'c1', parentMessageId: null, deletedAt: null } as MessageEntity,
    };
    const repo = createMockRepo<MessageEntity>({
      findOne: jest.fn(async (opts?: unknown) => {
        const where = (opts as { where?: { id?: string } })?.where;
        const id = where?.id;
        if (!id) return null;
        return byId[id] ?? null;
      }),
    });

    const chats = { getChat: jest.fn() } as unknown as ChatsService;
    const svc = new MessagesService(repo as unknown as never, chats, mkSse());

    const chain = await svc.listActiveChain('c1', 'm2');
    // m1 is deleted, should be skipped. Remaining: m0 -> m2
    expect(chain.map((m) => m.id)).toEqual(['m0', 'm2']);
  });
});
