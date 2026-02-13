import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { ChatEntity } from './entities/chat.entity';
import { MessageEntity } from './entities/message.entity';
import { MessageVariantEntity } from './entities/message-variant.entity';
import { ChatExportBundleDto } from './dto/chat-export.dto';

@Injectable()
export class ChatImportExportService {
  constructor(
    @InjectRepository(ChatEntity) private readonly chats: Repository<ChatEntity>,
    @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    @InjectRepository(MessageVariantEntity)
    private readonly variants: Repository<MessageVariantEntity>,
  ) {}

  async exportChat(chatId: string): Promise<ChatExportBundleDto> {
    const chat = await this.chats.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');

    const msgs = await this.messages.find({
      where: { chatId },
      order: { createdAt: 'ASC' },
    });

    const messageIds = msgs.map((m) => m.id);
    const vars = messageIds.length
      ? await this.variants.find({
          where: { messageId: In(messageIds) },
          order: { variantIndex: 'ASC' },
        })
      : [];

    const varsByMsg = new Map<string, MessageVariantEntity[]>();
    for (const v of vars) {
      const arr = varsByMsg.get(v.messageId) ?? [];
      arr.push(v);
      varsByMsg.set(v.messageId, arr);
    }

    return {
      version: 1,
      title: chat.title,
      defaultSettingsProfileId: chat.defaultSettingsProfileId,
      activeHeadMessageId: chat.activeHeadMessageId,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role as any,
        parentMessageId: m.parentMessageId,
        deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
        editedAt: m.editedAt ? m.editedAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
        variants: (varsByMsg.get(m.id) ?? []).map((v) => ({
          id: v.id,
          variantIndex: v.variantIndex,
          isActive: v.isActive,
          content: v.content,
          reasoning: v.reasoning,
          stats: v.stats,
          createdAt: v.createdAt.toISOString(),
        })),
      })),
    };
  }

  /**
   * Imports a chat bundle and creates a NEW chat with new ids.
   * Returns the created chat.
   */
  async importChat(bundle: ChatExportBundleDto): Promise<ChatEntity> {
    if (!bundle || bundle.version !== 1) {
      throw new BadRequestException('Unsupported bundle version');
    }

    // Basic validation
    const messages = Array.isArray(bundle.messages) ? bundle.messages : [];
    if (messages.length === 0) {
      throw new BadRequestException('Bundle contains no messages');
    }

    return this.chats.manager.transaction(async (trx) => {
      const chat = trx.create(ChatEntity, {
        title: bundle.title ?? 'Imported Chat',
        defaultSettingsProfileId: bundle.defaultSettingsProfileId ?? null,
        folderId: null,
        activeHeadMessageId: null,
        deletedAt: null,
        sortKey: 0,
      });
      const savedChat = await trx.save(chat);

      const idMap = new Map<string, string>();
      const pendingParents = new Map<string, string | null>();

      // 1) Create messages first (parent ids fixed in a second pass)
      for (const m of messages) {
        const msg = trx.create(MessageEntity, {
          chatId: savedChat.id,
          role: m.role,
          parentMessageId: null,
          deletedAt: m.deletedAt ? new Date(m.deletedAt) : null,
          editedAt: m.editedAt ? new Date(m.editedAt) : null,
        });
        const savedMsg = await trx.save(msg);
        idMap.set(m.id, savedMsg.id);
        pendingParents.set(savedMsg.id, m.parentMessageId ?? null);
      }

      // 2) Patch parent ids
      for (const [newId, oldParentId] of pendingParents.entries()) {
        const newParentId = oldParentId ? idMap.get(oldParentId) ?? null : null;
        await trx.update(MessageEntity, { id: newId }, { parentMessageId: newParentId });
      }

      // 3) Create variants
      for (const m of messages) {
        const newMessageId = idMap.get(m.id);
        if (!newMessageId) continue;

        const variants = Array.isArray(m.variants) ? m.variants : [];
        if (variants.length === 0) {
          // Ensure at least one variant exists for UI/runner
          const v = trx.create(MessageVariantEntity, {
            messageId: newMessageId,
            variantIndex: 0,
            isActive: true,
            content: '',
            reasoning: null,
            stats: null,
          });
          await trx.save(v);
          continue;
        }

        // Normalize: exactly one active variant
        const hasActive = variants.some((v) => v.isActive);
        const normalized = hasActive
          ? variants
          : variants.map((v, i) => ({ ...v, isActive: i === variants.length - 1 }));

        for (const v of normalized) {
          const ve = trx.create(MessageVariantEntity, {
            messageId: newMessageId,
            variantIndex: v.variantIndex,
            isActive: !!v.isActive,
            content: v.content ?? '',
            reasoning: v.reasoning ?? null,
            stats: v.stats ?? null,
          });
          await trx.save(ve);
        }
      }

      // 4) Set active head
      const oldHead = bundle.activeHeadMessageId ?? null;
      const newHead = oldHead ? idMap.get(oldHead) ?? null : null;
      await trx.update(ChatEntity, { id: savedChat.id }, { activeHeadMessageId: newHead });

      return trx.findOneOrFail(ChatEntity, { where: { id: savedChat.id } });
    });
  }
}
