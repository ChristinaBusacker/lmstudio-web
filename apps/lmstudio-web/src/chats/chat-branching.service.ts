import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatsService } from '../chats/chats.service';
import { MessagesService } from '../chats/messages.service';

/**
 * Use-case service for chat branching / head switching.
 *
 * Keeps the "activeHeadMessageId" consistent and validated.
 */
@Injectable()
export class ChatBranchingService {
  constructor(
    private readonly chats: ChatsService,
    private readonly messages: MessagesService,
  ) {}

  /**
   * Sets the active head of a chat to a given message id (or null).
   *
   * Validations:
   * - chat must exist and not be deleted (ChatsService.getChat already applies deletedAt filter)
   * - message must exist, belong to chat, and not be deleted
   */
  async activateHead(chatId: string, messageId: string | null) {
    const chat = await this.chats.getChat(chatId);
    if (!chat) throw new NotFoundException(`Chat not found: ${chatId}`);

    if (messageId) {
      const m = await this.messages.getById(messageId);
      if (!m) throw new NotFoundException(`Message not found: ${messageId}`);
      if (m.chatId !== chatId)
        throw new BadRequestException('Message does not belong to this chat');
      if (m.deletedAt) throw new BadRequestException('Cannot activate a deleted message as head');
    }

    await this.chats.setChatHead(chatId, messageId ?? null);
    return { chatId, activeHeadMessageId: messageId ?? null };
  }
}
