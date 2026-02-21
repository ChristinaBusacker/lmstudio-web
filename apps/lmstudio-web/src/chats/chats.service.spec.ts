import { ChatsService } from './chats.service';
import { MessageVariantsService } from './message-variants.service';
import { SseBusService } from '../sse/sse-bus.service';
import {
  createMockQueryBuilder,
  createMockRepo,
  type QueryBuilderLike,
} from '../../test/utils/mock-repo';
import type { ChatEntity } from './entities/chat.entity';
import type { MessageEntity } from './entities/message.entity';
import { MessageVariantEntity } from './entities/message-variant.entity';
import type { SseEnvelopeOf, SseEventType } from '@shared/contracts';

function createVariant(seed?: Partial<MessageVariantEntity>): MessageVariantEntity {
  const e = new MessageVariantEntity();
  Object.assign(e, {
    id: 'v1',
    messageId: 'm1',
    variantIndex: 0,
    isActive: true,
    content: '',
    reasoning: null,
    stats: null,
    createdAt: new Date(),
    ...(seed ?? {}),
  } satisfies Partial<MessageVariantEntity>);
  return e;
}

describe('ChatsService', () => {
  const mkSse = () =>
    ({
      publish: jest.fn(
        (<TType extends SseEventType>(
          e: Omit<SseEnvelopeOf<TType>, 'id' | 'ts'>,
        ): SseEnvelopeOf<TType> => ({
          ...e,
          id: 1,
          ts: new Date().toISOString(),
        })) as SseBusService['publish'],
      ) as unknown as SseBusService['publish'],
      publishEphemeral: jest.fn(),
      observeAll: jest.fn(),
      observeChat: jest.fn(),
      observeWorkflow: jest.fn(),
      observeWorkflowRun: jest.fn(),
      observeGlobal: jest.fn(),
      getChatReplay: jest.fn(),
      getWorkflowReplay: jest.fn(),
      getWorkflowRunReplay: jest.fn(),
      getRunReplay: jest.fn(),
    }) satisfies Partial<SseBusService> as unknown as SseBusService;

  const mkVariants = () =>
    ({
      createAndActivate: jest.fn(async (params) =>
        createVariant({
          id: 'v1',
          messageId: params.messageId,
          content: params.content,
        }),
      ),
    }) satisfies Partial<MessageVariantsService> as unknown as MessageVariantsService;

  function mkService(seed?: {
    chatsQb?: QueryBuilderLike;
    chats?: ReturnType<typeof createMockRepo<ChatEntity>>;
    messages?: ReturnType<typeof createMockRepo<MessageEntity>>;
    variants?: MessageVariantsService;
    sse?: SseBusService;
  }) {
    const qb = seed?.chatsQb ?? createMockQueryBuilder();

    const chatsRepo =
      seed?.chats ??
      createMockRepo<ChatEntity>({
        createQueryBuilder: jest.fn((_alias: string) => qb),
      });

    const messagesRepo = seed?.messages ?? createMockRepo<MessageEntity>();
    const variants = seed?.variants ?? mkVariants();
    const sse = seed?.sse ?? mkSse();

    const svc = new ChatsService(
      chatsRepo as unknown as never,
      messagesRepo as unknown as never,
      variants,
      sse,
    );

    return { svc, chatsRepo, messagesRepo, variants, sse, qb };
  }

  it('createChat assigns next sortKey and publishes sidebar/meta events', async () => {
    const qb = createMockQueryBuilder({
      getRawOne: jest.fn(async () => ({ max: 7 })),
    });

    const chatsRepo = createMockRepo<ChatEntity>({
      createQueryBuilder: jest.fn((_alias: string) => qb),
      save: jest.fn(async (e) => ({
        ...(e as ChatEntity),
        id: 'c1',
      })),
    });

    const { svc, sse } = mkService({ chatsQb: qb, chats: chatsRepo });
    const created = await svc.createChat('  Hello  ');

    expect(created?.id).toBe('c1');
    expect(chatsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Hello',
        folderId: null,
        deletedAt: null,
        sortKey: 8,
      }),
    );

    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'chat.meta.changed',
        chatId: 'c1',
      }),
    );
    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sidebar.changed',
      }),
    );
  });

  it('ensureAutoTitle does not overwrite a real title', async () => {
    const chatsRepo = createMockRepo<ChatEntity>({
      findOne: jest.fn(async () => ({ id: 'c1', title: 'Real Title' }) as ChatEntity) as any,
    });

    const { svc } = mkService({ chats: chatsRepo });
    await svc.ensureAutoTitle('c1', 'hello world');

    expect(chatsRepo.update).not.toHaveBeenCalled();
  });

  it('ensureAutoTitle trims and truncates to 60 chars and publishes events', async () => {
    const chatsRepo = createMockRepo<ChatEntity>({
      findOne: jest.fn(async () => ({ id: 'c1', title: 'Untitled' }) as ChatEntity) as any,
    });
    const { svc, sse } = mkService({ chats: chatsRepo });

    const input =
      '   This    is   a    long text that should become the chat title and be truncated   ';
    await svc.ensureAutoTitle('c1', input);

    const calledPatch = (chatsRepo.update.mock.calls[0]?.[1] ?? {}) as Partial<ChatEntity>;
    expect(typeof calledPatch.title).toBe('string');
    expect((calledPatch.title ?? '').length).toBeLessThanOrEqual(61); // 60 + ellipsis

    expect(sse.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chat.meta.changed', chatId: 'c1' }),
    );
    expect(sse.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'sidebar.changed' }));
  });

  it('createUserMessage creates node and activates a variant', async () => {
    const messagesRepo = createMockRepo<MessageEntity>({
      save: jest.fn(async (e) => ({
        ...(e as MessageEntity),
        id: 'm1',
      })),
    });

    const variants = {
      createAndActivate: jest.fn(async (params) =>
        createVariant({
          id: 'v1',
          messageId: params.messageId,
          content: params.content,
        }),
      ),
    } as unknown as MessageVariantsService;

    const { svc } = mkService({ messages: messagesRepo, variants });
    const msg = await svc.createUserMessage({ chatId: 'c1', content: 'hi', parentMessageId: null });

    expect(msg.id).toBe('m1');
    expect(messagesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', chatId: 'c1', parentMessageId: null }),
    );
    expect(variants.createAndActivate).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm1', content: 'hi' }),
    );
  });

  it('reorderChat throws when before/after are not in same folder scope', async () => {
    const chatsRepo = createMockRepo<ChatEntity>({
      findOne: jest.fn(async (opts?: unknown) => {
        const id = (opts as { where?: { id?: string } })?.where?.id;
        if (id === 'target') return { id: 'target', folderId: 'f1', sortKey: 10 } as ChatEntity;
        if (id === 'before') return { id: 'before', folderId: 'f2', sortKey: 5 } as ChatEntity;
        return null;
      }) as any,
    });

    const { svc } = mkService({ chats: chatsRepo });
    await expect(svc.reorderChat('target', { beforeId: 'before' })).rejects.toThrow(
      'beforeId not in same folder scope',
    );
  });
});
