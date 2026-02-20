import { MessageVariantsService } from './message-variants.service';
import { createMockQueryBuilder, createMockRepo } from '../../test/utils/mock-repo';
import type { MessageVariantEntity } from './entities/message-variant.entity';

describe('MessageVariantsService', () => {
  it('createAndActivate deactivates current active and sets next variantIndex', async () => {
    const repo = createMockRepo<MessageVariantEntity>({
      find: jest.fn(async () => [
        { id: 'v0', messageId: 'm1', variantIndex: 0, isActive: true } as MessageVariantEntity,
      ]),
      save: jest.fn(async (e) => ({ ...(e as MessageVariantEntity), id: 'v1' })),
    });
    const svc = new MessageVariantsService(repo as unknown as never);

    const res = await svc.createAndActivate({ messageId: 'm1', content: 'hello' });

    // deactivates active
    expect(repo.update).toHaveBeenCalledWith(
      { messageId: 'm1', isActive: true },
      { isActive: false },
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'm1',
        variantIndex: 1,
        isActive: true,
        content: 'hello',
      }),
    );
    expect(res.id).toBe('v1');
  });

  it('activate toggles active variant and returns new active', async () => {
    const repo = createMockRepo<MessageVariantEntity>({
      findOne: jest.fn(
        async () => ({ id: 'v2', messageId: 'm1', isActive: true }) as MessageVariantEntity,
      ),
    });
    const svc = new MessageVariantsService(repo as unknown as never);

    const res = await svc.activate('m1', 'v2');

    expect(repo.update).toHaveBeenNthCalledWith(
      1,
      { messageId: 'm1', isActive: true },
      { isActive: false },
    );
    expect(repo.update).toHaveBeenNthCalledWith(
      2,
      { id: 'v2', messageId: 'm1' },
      { isActive: true },
    );
    expect(res?.id).toBe('v2');
  });

  it('appendToActive updates only provided fields', async () => {
    const repo = createMockRepo<MessageVariantEntity>({
      findOne: jest.fn(
        async () =>
          ({
            id: 'v1',
            messageId: 'm1',
            isActive: true,
            content: 'a',
            reasoning: null,
          }) as MessageVariantEntity,
      ),
    });
    const svc = new MessageVariantsService(repo as unknown as never);

    await svc.appendToActive('m1', { content: 'b' });

    expect(repo.update).toHaveBeenCalledWith({ id: 'v1' }, { content: 'b', reasoning: null });
  });

  it('getCountsForMessages returns a map from raw query results', async () => {
    const qb = createMockQueryBuilder({
      getRawMany: jest.fn(
        async () =>
          [
            { messageId: 'm1', cnt: '2' },
            { messageId: 'm2', cnt: '5' },
          ] as unknown[],
      ),
    });

    const repo = createMockRepo<MessageVariantEntity>({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      createQueryBuilder: jest.fn((_alias: string) => qb),
    });
    const svc = new MessageVariantsService(repo as unknown as never);

    const map = await svc.getCountsForMessages(['m1', 'm2']);
    expect(map.get('m1')).toBe(2);
    expect(map.get('m2')).toBe(5);
  });
});
