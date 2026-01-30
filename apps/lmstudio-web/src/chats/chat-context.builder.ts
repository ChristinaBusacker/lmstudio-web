import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ChatEntity } from './entities/chat.entity';
import { MessageEntity } from './entities/message.entity';
import { MessageVariantsService } from './message-variants.service';
import type { LmMessage } from '../common/types/llm.types';

@Injectable()
export class ChatContextBuilder {
  constructor(
    @InjectRepository(ChatEntity) private readonly chats: Repository<ChatEntity>,
    @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    private readonly variants: MessageVariantsService,
  ) {}

  async buildActiveContext(chatId: string, systemPrompt?: string): Promise<LmMessage[]> {
    const chat = await this.chats.findOne({ where: { id: chatId, deletedAt: IsNull() } });

    if (!chat?.activeHeadMessageId) {
      return systemPrompt?.trim() ? [{ role: 'system', content: systemPrompt }] : [];
    }

    // walk backwards from head using parentMessageId
    const chain: MessageEntity[] = [];
    let currentId: string | null = chat.activeHeadMessageId;

    while (currentId) {
      const m = await this.messages.findOne({ where: { id: currentId } });
      if (!m) break;
      chain.push(m);
      currentId = m.parentMessageId ?? null;
    }

    chain.reverse();

    const out: LmMessage[] = [];
    if (systemPrompt?.trim()) out.push({ role: 'system', content: systemPrompt });

    for (const m of chain) {
      if (m.deletedAt) continue;

      const v = await this.variants.getActive(m.id);
      const content = v?.content ?? '';
      if (!content) continue;

      out.push({ role: m.role as any, content });
    }

    return out;
  }
}
