/* eslint-disable @typescript-eslint/no-unused-vars */
import type { DeepPartial } from 'typeorm';

export type QueryBuilderLike = {
  select: jest.MockedFunction<(selection: string, alias?: string) => QueryBuilderLike>;
  addSelect: jest.MockedFunction<(selection: string, alias?: string) => QueryBuilderLike>;
  where: jest.MockedFunction<
    (condition: string, parameters?: Record<string, unknown>) => QueryBuilderLike
  >;
  andWhere: jest.MockedFunction<
    (condition: string, parameters?: Record<string, unknown>) => QueryBuilderLike
  >;
  orderBy: jest.MockedFunction<(sort: string, order?: 'ASC' | 'DESC') => QueryBuilderLike>;
  take: jest.MockedFunction<(count: number) => QueryBuilderLike>;
  skip: jest.MockedFunction<(count: number) => QueryBuilderLike>;
  getRawOne: jest.MockedFunction<() => Promise<Record<string, unknown> | undefined>>;
  getRawMany: jest.MockedFunction<() => Promise<Array<Record<string, unknown>>>>;
};

export function createMockQueryBuilder(seed?: Partial<QueryBuilderLike>): QueryBuilderLike {
  const qb = {} as QueryBuilderLike;

  qb.select = jest.fn((_selection: string, _alias?: string) => qb);
  qb.addSelect = jest.fn((_selection: string, _alias?: string) => qb);
  qb.where = jest.fn((_condition: string, _parameters?: Record<string, unknown>) => qb);
  qb.andWhere = jest.fn((_condition: string, _parameters?: Record<string, unknown>) => qb);
  qb.orderBy = jest.fn((_sort: string, _order?: 'ASC' | 'DESC') => qb);
  qb.take = jest.fn((_count: number) => qb);
  qb.skip = jest.fn((_count: number) => qb);
  qb.getRawOne = jest.fn(async () => undefined);
  qb.getRawMany = jest.fn(async () => []);

  if (seed) Object.assign(qb, seed);
  return qb;
}

export type RepoLike<TEntity> = {
  create: jest.MockedFunction<(entityLike: DeepPartial<TEntity>) => TEntity>;
  findOne: jest.MockedFunction<(opts: unknown) => Promise<TEntity | null>>;
  find: jest.MockedFunction<(opts?: unknown) => Promise<TEntity[]>>;
  save: jest.MockedFunction<(entity: DeepPartial<TEntity>) => Promise<TEntity>>;
  update: jest.MockedFunction<(criteria: unknown, partial: DeepPartial<TEntity>) => Promise<void>>;
  delete: jest.MockedFunction<(criteria: unknown) => Promise<void>>;
  createQueryBuilder: jest.MockedFunction<(alias: string) => QueryBuilderLike>;
};

export function createMockRepo<TEntity>(seed?: Partial<RepoLike<TEntity>>): RepoLike<TEntity> {
  const repo: RepoLike<TEntity> = {
    create: jest.fn((entityLike: DeepPartial<TEntity>) => entityLike as TEntity),
    findOne: jest.fn(async (_opts: unknown) => null),
    find: jest.fn(async (_opts?: unknown) => []),
    save: jest.fn(async (entity: DeepPartial<TEntity>) => entity as TEntity),
    update: jest.fn(async (_criteria: unknown, _partial: DeepPartial<TEntity>) => undefined),
    delete: jest.fn(async (_criteria: unknown) => undefined),
    createQueryBuilder: jest.fn((_alias: string) => createMockQueryBuilder()),
  };

  if (seed) Object.assign(repo, seed);
  return repo;
}
