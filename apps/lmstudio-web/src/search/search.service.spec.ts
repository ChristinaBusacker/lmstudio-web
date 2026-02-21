import { SearchService } from './search.service';
import { createMockRepo } from '../../test/utils/mock-repo';
import type { ChatEntity } from '../chats/entities/chat.entity';

function createSearchQb(seed?: Partial<Record<string, any>>) {
  const qb: any = {
    leftJoin: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    setParameters: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getRawMany: jest.fn(async () => []),
  };
  if (seed) Object.assign(qb, seed);
  return qb;
}

function createManagerQb(seed?: Partial<Record<string, any>>) {
  const qb: any = {
    from: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    select: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getRawOne: jest.fn(async () => undefined),
  };
  if (seed) Object.assign(qb, seed);
  return qb;
}

describe('SearchService', () => {
  it('returns [] for blank term', async () => {
    const chats = createMockRepo<ChatEntity>();
    const svc = new SearchService(chats as any);
    await expect(svc.searchChats({ term: '   ' } as any)).resolves.toEqual([]);
  });

  it('builds query, maps rows, and includes snippets when enabled', async () => {
    const qb = createSearchQb({
      getRawMany: jest.fn(async () => [
        {
          chatId: 'c1',
          title: 'Hello term world',
          folderId: null,
          updatedAt: '2026-02-20T00:00:00.000Z',
          score: '120',
        },
      ]),
    });

    const managerQb = createManagerQb({
      getRawOne: jest.fn(async () => ({ role: 'user', content: 'some TERM in a message' })),
    });

    const chats = createMockRepo<ChatEntity>({
      createQueryBuilder: jest.fn(() => qb) as any,
    } as any) as any;

    chats.manager = {
      createQueryBuilder: jest.fn(() => managerQb),
    };

    const svc = new SearchService(chats);
    const out = await svc.searchChats({ term: 'term', limit: 10 } as any);

    expect(chats.createQueryBuilder).toHaveBeenCalledWith('c');
    expect(qb.setParameters).toHaveBeenCalledWith({ like: '%term%', starts: 'term%' });
    expect(qb.limit).toHaveBeenCalledWith(10);

    expect(out).toHaveLength(1);
    expect(out[0]!.chatId).toBe('c1');
    expect(out[0]!.score).toBe(120);
    // title snippet + message snippet
    expect(out[0]!.matches.length).toBeGreaterThanOrEqual(1);
    expect(out[0]!.matches.some((m) => m.type === 'title')).toBe(true);
    expect(out[0]!.matches.some((m) => m.type === 'user_message')).toBe(true);

    expect(chats.manager.createQueryBuilder).toHaveBeenCalled();
  });

  it('skips per-result hit lookup when includeSnippets=false', async () => {
    const qb = createSearchQb({
      getRawMany: jest.fn(async () => [
        {
          chatId: 'c1',
          title: 'Hello term world',
          folderId: null,
          updatedAt: '2026-02-20T00:00:00.000Z',
          score: 100,
        },
      ]),
    });

    const chats = createMockRepo<ChatEntity>({
      createQueryBuilder: jest.fn(() => qb) as any,
    } as any) as any;

    chats.manager = {
      createQueryBuilder: jest.fn(() => createManagerQb()),
    };

    const svc = new SearchService(chats);
    const out = await svc.searchChats({ term: 'term', includeSnippets: false } as any);

    expect(out).toHaveLength(1);
    expect(out[0]!.matches).toEqual([]);
    expect(chats.manager.createQueryBuilder).not.toHaveBeenCalled();
  });
});
