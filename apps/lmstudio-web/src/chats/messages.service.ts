import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageEntity } from './entities/message.entity';
import { ChatsService } from './chats.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    private readonly chats: ChatsService,
  ) {}

  async getById(messageId: string) {
    return this.messages.findOne({ where: { id: messageId } });
  }

  async markEdited(messageId: string) {
    await this.messages.update({ id: messageId }, { editedAt: new Date() });
  }

  async softDeleteMessage(messageId: string) {
    const msg = await this.getById(messageId);
    if (!msg) throw new NotFoundException(`Message not found: ${messageId}`);

    if (!msg.deletedAt) {
      await this.messages.update({ id: messageId }, { deletedAt: new Date() });
    }

    const chat = await this.chats.getChat(msg.chatId);
    // chat may be deleted; we still deleted the message. Head repair only if chat exists.
    if (chat && chat.activeHeadMessageId === msg.id) {
      await this.chats.setChatHead(chat.id, msg.parentMessageId ?? null);
    }

    return { messageId, deletedAt: new Date().toISOString() };
  }

  async listByChat(chatId: string) {
    return this.messages.find({
      where: { chatId },
      order: { createdAt: 'ASC' },
    });
  }

  async listActiveChain(chatId: string, activeHeadMessageId: string | null) {
    if (!activeHeadMessageId) return [];
    const chain: MessageEntity[] = [];

    let currentId: string | null = activeHeadMessageId;
    while (currentId) {
      const m = await this.messages.findOne({ where: { id: currentId } });
      if (!m) break;
      if (!m.deletedAt) chain.push(m);
      currentId = m.parentMessageId;
    }

    return chain.reverse();
  }
}
