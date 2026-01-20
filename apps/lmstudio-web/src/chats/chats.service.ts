/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, LessThan, Repository } from 'typeorm';
import { ChatEntity } from './entities/chat.entity';
import { MessageEntity } from './entities/message.entity';
import { MessageVariantsService } from './message-variants.service';
import { SseBusService } from '../sse/sse-bus.service';

@Injectable()
export class ChatsService {
  constructor(
    @InjectRepository(ChatEntity) private readonly chats: Repository<ChatEntity>,
    @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    private readonly variants: MessageVariantsService,
    private readonly sse: SseBusService,
  ) {}

  async getChatMeta(chatId: string) {
    return this.chats.findOne({ where: { id: chatId }, select: ['id'] });
  }

  async createChat(title?: string) {
    const chat = this.chats.create({
      title: title?.trim() ? title.trim() : null,
      activeHeadMessageId: null,
      folderId: null,
      deletedAt: null,
    });

    const saved = await this.chats.save(chat);

    this.sse.publish({
      type: 'chat.meta.changed',
      chatId: saved.id,
      payload: { fields: ['deletedAt'] },
    });

    this.sse.publish({
      type: 'sidebar.changed',
      payload: { reason: 'chat-deleted' },
    });

    return saved;
  }

  async renameChat(chatId: string, title: string) {
    await this.chats.update({ id: chatId }, { title: title.trim() });

    this.sse.publish({
      type: 'chat.meta.changed',
      chatId,
      payload: { fields: ['title'] },
    });

    this.sse.publish({
      type: 'sidebar.changed',
      payload: { reason: 'chat-renamed' },
    });

    return this.chats.findOne({ where: { id: chatId } });
  }

  async setChatHead(chatId: string, messageId: string | null) {
    await this.chats.update({ id: chatId }, { activeHeadMessageId: messageId });
  }

  async getChat(chatId: string) {
    return this.chats.findOne({ where: { id: chatId, deletedAt: IsNull() } });
  }

  async getChatWithMessages(chatId: string) {
    return this.chats.findOne({
      where: { id: chatId, deletedAt: IsNull() },
      relations: ['messages'],
    });
  }

  /**
   * Lists chats for sidebar/overview UI.
   * Uses cursor pagination by updatedAt (DESC).
   */
  async listChats(params?: {
    limit?: number;
    cursor?: string;
    folderId?: string;
    includeDeleted?: boolean;
  }): Promise<ChatEntity[]> {
    const limit = params?.limit ?? 50;

    const where: FindOptionsWhere<ChatEntity> = {};

    if (!params?.includeDeleted) {
      (where as any).deletedAt = IsNull();
    }

    if (params?.folderId !== undefined) {
      if (params.folderId === 'null') (where as any).folderId = IsNull();
      else (where as any).folderId = params.folderId;
    }

    if (params?.cursor) {
      // Cursor: updatedAt < cursor
      (where as any).updatedAt = LessThan(new Date(params.cursor));
    }

    return this.chats.find({
      where,
      order: { updatedAt: 'DESC' as any },
      take: limit,
      select: [
        'id',
        'title',
        'folderId',
        'activeHeadMessageId',
        'defaultSettingsProfileId',
        'deletedAt',
        'createdAt',
        'updatedAt',
      ],
    });
  }

  async createMessageNode(params: {
    chatId: string;
    role: 'system' | 'user' | 'assistant';
    parentMessageId: string | null;
  }) {
    const m = this.messages.create({
      chatId: params.chatId,
      role: params.role,
      parentMessageId: params.parentMessageId,
      deletedAt: null,
      editedAt: null,
    });
    return this.messages.save(m);
  }

  async createUserMessage(params: {
    chatId: string;
    content: string;
    parentMessageId: string | null;
  }) {
    const msg = await this.createMessageNode({
      chatId: params.chatId,
      role: 'user',
      parentMessageId: params.parentMessageId,
    });

    await this.variants.createAndActivate({
      messageId: msg.id,
      content: params.content,
    });

    return msg;
  }

  async createAssistantPlaceholder(params: { chatId: string; parentMessageId: string }) {
    const msg = await this.createMessageNode({
      chatId: params.chatId,
      role: 'assistant',
      parentMessageId: params.parentMessageId,
    });

    // start with empty active variant so worker can append
    await this.variants.createAndActivate({
      messageId: msg.id,
      content: '',
      reasoning: null,
    });

    return msg;
  }

  async ensureAutoTitle(chatId: string, firstUserText: string) {
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (!chat) return;
    if (chat.title && chat.title.trim().length > 0) return;

    const cleaned = firstUserText.replace(/\s+/g, ' ').trim();
    const title = cleaned.length > 60 ? cleaned.slice(0, 60) + '…' : cleaned;

    await this.chats.update({ id: chatId }, { title });

    this.sse.publish({
      type: 'chat.meta.changed',
      chatId,
      payload: { fields: ['title'], patch: { title } },
    });

    this.sse.publish({
      type: 'sidebar.changed',
      payload: { reason: 'auto-title' },
    });
  }

  async softDeleteChat(chatId: string) {
    await this.chats.update({ id: chatId }, { deletedAt: new Date() });
  }
}
