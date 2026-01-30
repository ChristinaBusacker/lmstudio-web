import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ChatFolderEntity } from './entities/chat-folder.entity';
import { ChatEntity } from './entities/chat.entity';
import { SseBusService } from '../sse/sse-bus.service';

@Injectable()
export class ChatFoldersService {
  constructor(
    @InjectRepository(ChatFolderEntity)
    private readonly folders: Repository<ChatFolderEntity>,
    @InjectRepository(ChatEntity)
    private readonly chats: Repository<ChatEntity>,
    private sse: SseBusService,
  ) {}

  async list() {
    return this.folders.find({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'ASC' as any },
    });
  }

  async getById(folderId: string) {
    return this.folders.findOne({ where: { id: folderId } });
  }

  async create(name: string) {
    const f = this.folders.create({
      name: name.trim(),
      deletedAt: null,
    });

    const saved = this.folders.save(f);

    this.sse.publish({
      type: 'sidebar.changed',
      payload: { reason: 'folder-updated' },
    });

    return saved;
  }

  async update(folderId: string, patch: { name?: string }) {
    const existing = await this.getById(folderId);
    if (!existing || existing.deletedAt) return null;

    if (patch.name !== undefined) {
      await this.folders.update({ id: folderId }, { name: patch.name.trim() });
    }

    this.sse.publish({
      type: 'sidebar.changed',
      payload: { reason: 'folder-updated' },
    });

    return this.getById(folderId);
  }

  /**
   * Soft delete folder and move all chats out of it (folderId -> null).
   */
  async softDelete(
    folderId: string,
  ): Promise<{ folder: ChatFolderEntity | null; affectedChats: number }> {
    const existing = await this.getById(folderId);
    if (!existing || existing.deletedAt) return { folder: null, affectedChats: 0 };

    // move chats out
    const res = await this.chats.update({ folderId }, { folderId: null });

    // soft delete folder
    await this.folders.update({ id: folderId }, { deletedAt: new Date() });

    return { folder: await this.getById(folderId), affectedChats: res.affected ?? 0 };
  }

  async moveChat(chatId: string, folderId: string | null) {
    if (folderId === null) {
      await this.chats.update({ id: chatId }, { folderId: null });
      return true;
    }

    const folder = await this.getById(folderId);
    if (!folder || folder.deletedAt) return false;

    await this.chats.update({ id: chatId }, { folderId });

    const res = await this.chats
      .createQueryBuilder('c')
      .select('MAX(c.sortKey)', 'max')
      .where('c.deletedAt IS NULL')
      .andWhere(folderId ? 'c.folderId = :fid' : 'c.folderId IS NULL', { folderId })
      .getRawOne<{ max: number | null }>();

    if (res) {
      const { max } = res;

      await this.chats.update(
        { id: chatId },
        { folderId: folderId ?? null, sortKey: (max ?? 0) + 1 },
      );
    }

    this.sse.publish({
      type: 'sidebar.changed',
      payload: { reason: 'folder-updated' },
    });
    return true;
  }
}
