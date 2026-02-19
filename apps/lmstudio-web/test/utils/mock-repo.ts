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
  save: jest.MockedFunction<(entity: DeepPartial<TEntity>) => Promise<TEntity>>;
  update: jest.MockedFunction<(criteria: unknown, partial: DeepPartial<TEntity>) => Promise<void>>;
  delete: jest.MockedFunction<(criteria: unknown) => Promise<void>>;
};

export function createMockRepo<TEntity extends object>(
  seed?: Partial<RepoLike<TEntity>>,
): RepoLike<TEntity> {
  const repo: RepoLike<TEntity> = {
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    save: jest.fn(async (entity) => entity as TEntity),
    update: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
  };

  return { ...repo, ...(seed ?? {}) };
}
