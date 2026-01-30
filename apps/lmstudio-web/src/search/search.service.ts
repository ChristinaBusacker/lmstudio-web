// src/search/search.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatEntity } from '../chats/entities/chat.entity';
import { SearchChatsQueryDto } from './dto/search-chats.query.dto';
import { SearchChatResultDto, SearchChatMatchDto } from './dto/search-chat-result.dto';

function normTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ');
}

function makeSnippet(text: string, termLower: string, max = 140): string | null {
  const t = text ?? '';
  const lower = t.toLowerCase();
  const idx = lower.indexOf(termLower);
  if (idx < 0) return null;

  const start = Math.max(0, idx - Math.floor(max / 2));
  const end = Math.min(t.length, start + max);
  const slice = t.slice(start, end);
  return (start > 0 ? '…' : '') + slice + (end < t.length ? '…' : '');
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(ChatEntity)
    private readonly chats: Repository<ChatEntity>,
  ) {}

  /**
   * V1 ranking:
   * - title hit: +100 (+10 if startsWith)
   * - user msg hit: +30
   * - assistant msg hit: +20
   *
   * Notes:
   * - Uses active variant content for assistant/user messages.
   * - LIKE search is case-insensitive-ish depending on collation; we normalize lower for snippets only.
   */
  async searchChats(q: SearchChatsQueryDto): Promise<SearchChatResultDto[]> {
    const term = normTerm(q.term);
    if (!term) return [];

    const limit = Math.min(q.limit ?? 20, 100);
    const includeSnippets = q.includeSnippets !== false;
    const includeDeleted = q.includeDeleted === true;

    // SQLite LIKE: we’ll search with %term%.
    // For other DBs you might use ILIKE. Keep V1 simple.
    const like = `%${term}%`;

    /**
     * Query strategy:
     * 1) Start from chats
     * 2) LEFT JOIN messages + active variants (only active variant per message)
     * 3) Aggregate score per chat using SUM(CASE ...)
     *
     * This keeps results to 1 row/chat and lets DB do the heavy lifting.
     */
    const qb = this.chats
      .createQueryBuilder('c')
      .leftJoin('c.messages', 'm', 'm.deletedAt IS NULL')
      .leftJoin('m.variants', 'v', 'v.isActive = 1')
      .select('c.id', 'chatId')
      .addSelect('c.title', 'title')
      .addSelect('c.folderId', 'folderId')
      .addSelect('c.updatedAt', 'updatedAt')
      .addSelect(
        `
        (
          CASE WHEN c.title LIKE :like THEN 100 ELSE 0 END
          + CASE WHEN c.title LIKE :starts THEN 10 ELSE 0 END
          + SUM(CASE WHEN m.role = 'user' AND v.content LIKE :like THEN 30 ELSE 0 END)
          + SUM(CASE WHEN m.role = 'assistant' AND v.content LIKE :like THEN 20 ELSE 0 END)
        )
        `,
        'score',
      )
      .where(includeDeleted ? '1=1' : 'c.deletedAt IS NULL')
      .andWhere(
        `
        (
          c.title LIKE :like
          OR (v.content LIKE :like AND m.role IN ('user','assistant'))
        )
        `,
      )
      .setParameters({
        like,
        starts: `${term}%`,
      })
      .groupBy('c.id')
      .orderBy('score', 'DESC')
      .addOrderBy('c.updatedAt', 'DESC')
      .limit(limit);

    const rows = await qb.getRawMany<{
      chatId: string;
      title: string | null;
      folderId: string | null;
      updatedAt: Date | string;
      score: number | string;
    }>();

    // Optional: compute match details/snippets (second query per result is expensive),
    // so for V1 we do *one* extra query for a small set to fetch best hit text.
    // If includeSnippets=false we skip this completely.
    const results: SearchChatResultDto[] = [];
    const termLower = term.toLowerCase();

    for (const r of rows) {
      const score = typeof r.score === 'string' ? Number(r.score) : r.score;
      const updatedAtIso =
        r.updatedAt instanceof Date
          ? r.updatedAt.toISOString()
          : new Date(r.updatedAt).toISOString();

      const matches: SearchChatMatchDto[] = [];

      if (includeSnippets) {
        // title match snippet
        if ((r.title ?? '').toLowerCase().includes(termLower)) {
          matches.push({
            type: 'title',
            snippet: makeSnippet(r.title ?? '', termLower, 120),
          });
        }

        // pull the most relevant message hit (user first, then assistant)
        // NOTE: This assumes you have ChatEntity -> messages -> variants relation names.
        const hit = await this.chats.manager
          .createQueryBuilder()
          .from('message', 'm')
          .leftJoin('message_variant', 'v', 'v.messageId = m.id AND v.isActive = 1')
          .select(['m.role AS role', 'v.content AS content'])
          .where('m.chatId = :chatId', { chatId: r.chatId })
          .andWhere('m.deletedAt IS NULL')
          .andWhere("m.role IN ('user','assistant')")
          .andWhere('v.content LIKE :like', { like })
          .orderBy(`CASE WHEN m.role='user' THEN 0 ELSE 1 END`, 'ASC')
          .addOrderBy('m.createdAt', 'DESC')
          .limit(1)
          .getRawOne<{ role: 'user' | 'assistant'; content: string } | undefined>();

        if (hit?.content) {
          matches.push({
            type: hit.role === 'user' ? 'user_message' : 'assistant_message',
            snippet: makeSnippet(hit.content, termLower, 180),
          });
        }
      }

      results.push({
        chatId: r.chatId,
        title: r.title ?? null,
        folderId: r.folderId ?? null,
        updatedAt: updatedAtIso,
        score: Number.isFinite(score) ? score : 0,
        matches,
      });
    }

    return results;
  }
}
