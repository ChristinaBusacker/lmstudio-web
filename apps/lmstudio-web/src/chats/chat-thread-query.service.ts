import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { MessagesService } from './messages.service';
import { MessageVariantsService } from './message-variants.service';
import { ChatThreadResponseDto } from './dto/thread.dto';

@Injectable()
export class ChatThreadQueryService {
  constructor(
    private readonly chats: ChatsService,
    private readonly messages: MessagesService,
    private readonly variants: MessageVariantsService,
  ) {}

  async getThread(
    chatId: string,
    opts?: { includeReasoning?: boolean },
  ): Promise<ChatThreadResponseDto> {
    const chat = await this.chats.getChat(chatId);
    if (!chat) throw new NotFoundException('Chat not found');

    const chain = await this.messages.listActiveChain(chatId, chat.activeHeadMessageId);

    const messageIds = chain.map((m) => m.id);
    const activeVariants = await this.variants.getActiveForMessages(messageIds); // neue helper-methode

    const byMessageId = new Map(activeVariants.map((v) => [v.messageId, v]));
    const counts = await this.variants.getCountsForMessages(messageIds);

    return {
      chatId: chat.id,
      title: chat.title,
      folderId: chat.folderId,
      activeHeadMessageId: chat.activeHeadMessageId,
      messages: chain.map((m) => {
        const v = byMessageId.get(m.id);

        const safe = v ?? {
          id: 'missing',
          messageId: m.id,
          variantIndex: 0,
          isActive: true,
          content: '',
          reasoning: null,
          stats: null,
          createdAt: m.createdAt,
        };

        return {
          id: m.id,
          chatId: m.chatId,
          role: m.role,
          parentMessageId: m.parentMessageId,
          deletedAt: m.deletedAt?.toISOString() ?? null,
          editedAt: m.editedAt?.toISOString() ?? null,
          createdAt: m.createdAt.toISOString(),
          activeVariant: {
            id: safe.id,
            variantIndex: safe.variantIndex,
            variantsCount: counts.get(m.id) ?? 0,
            isActive: true,
            content: safe.content,
            reasoning: opts?.includeReasoning ? (safe.reasoning ?? null) : undefined,
            stats: safe.stats ?? null,
            createdAt:
              safe.createdAt instanceof Date
                ? safe.createdAt.toISOString()
                : new Date(safe.createdAt).toISOString(),
          },
        };
      }),
    };
  }
}
