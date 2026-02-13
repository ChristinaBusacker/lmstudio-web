/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ChatsService } from './chats.service';
import { ChatEntity } from './entities/chat.entity';
import { MessageEntity } from './entities/message.entity';
import { MessageVariantEntity } from './entities/message-variant.entity';

/**
 * Creates a NEW chat that contains the message chain up to a given message.
 *
 * This is the UX-friendly flavor of "branching": instead of moving the head within
 * the same chat (which can be confusing), we fork the conversation into a new chat.
 */
@Injectable()
export class ChatForkService {
  constructor(
    private readonly chats: ChatsService,
    @InjectRepository(ChatEntity) private readonly chatRepo: Repository<ChatEntity>,
    @InjectRepository(MessageEntity) private readonly msgRepo: Repository<MessageEntity>,
    @InjectRepository(MessageVariantEntity)
    private readonly variantRepo: Repository<MessageVariantEntity>,
  ) {}

  async forkChat(params: { chatId: string; fromMessageId: string }): Promise<ChatEntity> {
    const srcChat = await this.chatRepo.findOne({
      where: { id: params.chatId, deletedAt: IsNull() },
    });
    if (!srcChat) throw new NotFoundException(`Chat not found: ${params.chatId}`);

    const target = await this.msgRepo.findOne({
      where: { id: params.fromMessageId, chatId: params.chatId },
    });
    if (!target) throw new NotFoundException(`Message not found: ${params.fromMessageId}`);
    if (target.deletedAt) throw new BadRequestException('Cannot branch from a deleted message');

    // 1) Build the chain up to the target message by walking parent pointers.
    const chain: MessageEntity[] = [];
    let current: MessageEntity | null = target;
    while (current) {
      if (!current.deletedAt) chain.push(current);

      if (!current.parentMessageId) break;
      current = await this.msgRepo.findOne({
        where: { id: current.parentMessageId, chatId: params.chatId },
      });
    }
    chain.reverse();

    // Defensive: if we couldn't reach a root (data corruption), still allow fork.
    if (chain.length === 0) throw new BadRequestException('Cannot build chain for branching');

    // 2) Create the new chat (keeps sortKey + sidebar SSE semantics in one place).
    const newTitle = srcChat.title?.trim()
      ? `${srcChat.title.trim()} (branch)`
      : 'Untitled (branch)';

    const dstChat = await this.chats.createChat(newTitle);
    if (!dstChat) throw new BadRequestException('Failed to create branch chat');

    // Copy chat-level defaults.
    await this.chatRepo.update(
      { id: dstChat.id },
      {
        defaultSettingsProfileId: srcChat.defaultSettingsProfileId ?? null,
        folderId: srcChat.folderId ?? null,
      },
    );

    // 3) Clone messages.
    const idMap = new Map<string, string>();
    let prevNewId: string | null = null;

    for (const src of chain) {
      const created = await this.msgRepo.save(
        this.msgRepo.create({
          chatId: dstChat.id,
          role: src.role,
          parentMessageId: prevNewId,
          deletedAt: null,
          editedAt: src.editedAt ?? null,
        }),
      );
      idMap.set(src.id, created.id);
      prevNewId = created.id;
    }

    const newHeadId = idMap.get(target.id) ?? null;
    await this.chatRepo.update({ id: dstChat.id }, { activeHeadMessageId: newHeadId });

    // 4) Clone ALL variants for these messages (so the user can still switch between them).
    const srcMessageIds = chain.map((m) => m.id);
    const variants = await this.variantRepo.find({
      where: { messageId: In(srcMessageIds) },
      order: { messageId: 'ASC' as any, variantIndex: 'ASC' as any, createdAt: 'ASC' as any },
    });

    if (variants.length) {
      const toInsert: MessageVariantEntity[] = [];
      for (const v of variants) {
        const newMsgId = idMap.get(v.messageId);
        if (!newMsgId) continue;

        toInsert.push(
          this.variantRepo.create({
            messageId: newMsgId,
            variantIndex: v.variantIndex,
            isActive: v.isActive,
            content: v.content,
            reasoning: v.reasoning ?? null,
            stats: v.stats ?? null,
          }),
        );
      }
      await this.variantRepo.save(toInsert);
    }

    // Return fresh chat row with patched fields.
    const out = await this.chatRepo.findOne({ where: { id: dstChat.id } });
    if (!out) throw new BadRequestException('Failed to load branch chat');
    return out;
  }
}
