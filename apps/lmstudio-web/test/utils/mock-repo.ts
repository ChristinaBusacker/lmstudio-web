/* eslint-disable @typescript-eslint/no-unused-vars */
import type { DeepPartial } from 'typeorm';

/**
 * A tiny, typed repository mock that covers the most common TypeORM Repository calls.
 *
 * This intentionally avoids importing TypeORM's Repository class to keep tests light
 * and to avoid `any` leakage from complex generic signatures.
 */
export type RepoLike<TEntity extends object> = {
  findOne: jest.MockedFunction<(opts?: unknown) => Promise<TEntity | null>>;
  find: jest.MockedFunction<(opts?: unknown) => Promise<TEntity[]>>;
  create: jest.MockedFunction<(entityLike: DeepPartial<TEntity>) => TEntity>;
  save: jest.MockedFunction<(entity: DeepPartial<TEntity>) => Promise<TEntity>>;
  update: jest.MockedFunction<(criteria: unknown, partial: DeepPartial<TEntity>) => Promise<void>>;
  delete: jest.MockedFunction<(criteria: unknown) => Promise<void>>;
  createQueryBuilder?: jest.MockedFunction<(alias: string) => QueryBuilderLike>;
};

export type QueryBuilderLike = {
  select: jest.MockedFunction<(selection: string, alias?: string) => QueryBuilderLike>;
  addSelect: jest.MockedFunction<(selection: string, alias?: string) => QueryBuilderLike>;
  where: jest.MockedFunction<
    (clause: string, params?: Record<string, unknown>) => QueryBuilderLike
  >;
  andWhere: jest.MockedFunction<
    (clause: string, params?: Record<string, unknown>) => QueryBuilderLike
  >;
  groupBy: jest.MockedFunction<(clause: string) => QueryBuilderLike>;
  getRawOne: jest.MockedFunction<() => Promise<unknown>>;
  getRawMany: jest.MockedFunction<() => Promise<unknown[]>>;
};

export function createMockQueryBuilder(seed?: Partial<QueryBuilderLike>): QueryBuilderLike {
  const qb: QueryBuilderLike = {
    select: jest.fn((_selection: string, _alias?: string) => qb),
    addSelect: jest.fn((_selection: string, _alias?: string) => qb),
    where: jest.fn((_clause: string, _params?: Record<string, unknown>) => qb),
    andWhere: jest.fn((_clause: string, _params?: Record<string, unknown>) => qb),
    groupBy: jest.fn((_clause: string) => qb),
    getRawOne: jest.fn(async () => undefined),
    getRawMany: jest.fn(async () => []),
  };
  return { ...qb, ...(seed ?? {}) };
}

export function createMockRepo<TEntity extends object>(
  seed?: Partial<RepoLike<TEntity>>,
): RepoLike<TEntity> {
  const repo: RepoLike<TEntity> = {
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    create: jest.fn((entity) => entity as TEntity),
    save: jest.fn(async (entity) => entity as TEntity),
    update: jest.fn(async (_criteria: unknown, _partial: DeepPartial<TEntity>): Promise<void> => {
      // noop
    }),
    delete: jest.fn(async (_criteria: unknown): Promise<void> => {
      // noop
    }),
  };

  return { ...repo, ...(seed ?? {}) };
}
