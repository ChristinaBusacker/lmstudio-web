/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MessageVariantEntity } from './entities/message-variant.entity';

@Injectable()
export class MessageVariantsService {
  constructor(
    @InjectRepository(MessageVariantEntity)
    private readonly variants: Repository<MessageVariantEntity>,
  ) {}

  async list(messageId: string) {
    return this.variants.find({
      where: { messageId },
      order: { variantIndex: 'ASC' as any, createdAt: 'ASC' as any },
    });
  }

  async getActive(messageId: string) {
    return this.variants.findOne({ where: { messageId, isActive: true } });
  }

  async createAndActivate(params: {
    messageId: string;
    content: string;
    reasoning?: string | null;
    stats?: any | null;
  }) {
    const existing = await this.list(params.messageId);
    const nextIndex = existing.length ? Math.max(...existing.map((v) => v.variantIndex)) + 1 : 0;

    // deactivate all
    await this.variants.update(
      { messageId: params.messageId, isActive: true },
      { isActive: false },
    );

    const v = this.variants.create({
      messageId: params.messageId,
      variantIndex: nextIndex,
      isActive: true,
      content: params.content,
      reasoning: params.reasoning ?? null,
      stats: params.stats ?? null,
    });
    return this.variants.save(v);
  }

  async activate(messageId: string, variantId: string) {
    await this.variants.update({ messageId, isActive: true }, { isActive: false });
    await this.variants.update({ id: variantId, messageId }, { isActive: true });
    return this.getActive(messageId);
  }

  async appendToActive(messageId: string, patch: { content?: string; reasoning?: string }) {
    const active = await this.getActive(messageId);
    if (!active) return null;

    const next = {
      content: patch.content ?? active.content,
      reasoning: patch.reasoning ?? active.reasoning ?? null,
    };

    await this.variants.update({ id: active.id }, next);
    return this.getActive(messageId);
  }

  async getActiveForMessages(messageIds: string[]) {
    if (messageIds.length === 0) return [];
    return this.variants.find({
      where: {
        messageId: In(messageIds),
        isActive: true,
      },
    });
  }

  async getCountsForMessages(messageIds: string[]): Promise<Map<string, number>> {
    if (messageIds.length === 0) return new Map();

    const rows = await this.variants
      .createQueryBuilder('v')
      .select('v.messageId', 'messageId')
      .addSelect('COUNT(1)', 'cnt')
      .where('v.messageId IN (:...ids)', { ids: messageIds })
      .groupBy('v.messageId')
      .getRawMany<{ messageId: string; cnt: string }>();

    const map = new Map<string, number>();
    for (const r of rows) map.set(r.messageId, Number(r.cnt));
    return map;
  }
}
