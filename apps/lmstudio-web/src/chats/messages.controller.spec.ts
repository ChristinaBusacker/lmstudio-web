import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import type { MessagesService } from './messages.service';
import type { MessageVariantsService } from './message-variants.service';
import type { MessageEntity } from './entities/message.entity';
import type { MessageVariantEntity } from './entities/message-variant.entity';

describe('MessagesController', () => {
  function mkController(seed?: {
    messages?: Partial<MessagesService>;
    variants?: Partial<MessageVariantsService>;
  }) {
    const messages = {
      getById: jest.fn(async () => null as MessageEntity | null),
      markEdited: jest.fn(async () => undefined),
      softDeleteMessage: jest.fn(),
      ...(seed?.messages ?? {}),
    } as unknown as MessagesService;

    const variants = {
      list: jest.fn(async () => [] as MessageVariantEntity[]),
      createAndActivate: jest.fn(
        async () =>
          ({
            id: 'v1',
            messageId: 'm1',
            variantIndex: 0,
            isActive: true,
            content: 'x',
            reasoning: null,
            stats: null,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
          }) as unknown as MessageVariantEntity,
      ),
      activate: jest.fn(async () => null as MessageVariantEntity | null),
      ...(seed?.variants ?? {}),
    } as unknown as MessageVariantsService;

    return { controller: new MessagesController(messages, variants), messages, variants };
  }

  it('list throws NotFound when message does not exist', async () => {
    const { controller } = mkController({
      messages: { getById: jest.fn(async () => null) },
    });

    await expect(controller.list('m1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rejects empty/whitespace content', async () => {
    const { controller } = mkController({
      messages: { getById: jest.fn(async () => ({ id: 'm1', deletedAt: null }) as MessageEntity) },
    });

    await expect(controller.create('m1', { content: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('create rejects when message is deleted', async () => {
    const { controller } = mkController({
      messages: {
        getById: jest.fn(async () => ({ id: 'm1', deletedAt: new Date() }) as MessageEntity),
      },
    });

    await expect(controller.create('m1', { content: 'hi' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('create activates new variant and marks message edited', async () => {
    const { controller, variants, messages } = mkController({
      messages: { getById: jest.fn(async () => ({ id: 'm1', deletedAt: null }) as MessageEntity) },
    });

    const res = await controller.create('m1', { content: '  hi  ' });
    expect(variants.createAndActivate).toHaveBeenCalledWith({ messageId: 'm1', content: 'hi' });
    expect(messages.markEdited).toHaveBeenCalledWith('m1');
    expect(res.messageId).toBe('m1');
    expect(res.content).toBe('x');
  });

  it('activate throws NotFound when variant activation returns null', async () => {
    const { controller } = mkController({
      messages: { getById: jest.fn(async () => ({ id: 'm1', deletedAt: null }) as MessageEntity) },
      variants: { activate: jest.fn(async () => null) },
    });

    await expect(controller.activate('m1', { variantId: 'v1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
