import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { GenerationSettingsProfileEntity } from './entities/generation-settings-profile.entity';
import { createMockRepo } from '../../test/utils/mock-repo';

function createTxRepoSeed() {
  const repo = createMockRepo<GenerationSettingsProfileEntity>() as any;
  repo.update = jest.fn(async () => undefined);
  repo.create = jest.fn((x: any) => x);
  repo.save = jest.fn(async (x: any) => ({ id: 'p-new', ...x }));
  repo.findOne = jest.fn(async () => ({ id: 'p1', ownerKey: 'default', name: 'X', isDefault: true }));
  return repo;
}

describe('SettingsService', () => {
  it('create() rejects empty names', async () => {
    const profiles = createMockRepo<GenerationSettingsProfileEntity>({
      count: jest.fn(async () => 0) as any,
    } as any);
    const ds = { transaction: jest.fn() } as any;
    const svc = new SettingsService(profiles as any, ds);

    await expect(svc.create({ name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create() makes first profile default when not specified', async () => {
    const profiles = createMockRepo<GenerationSettingsProfileEntity>({
      count: jest.fn(async () => 0) as any,
    } as any);

    const txRepo = createTxRepoSeed();
    const ds = {
      transaction: jest.fn(async (fn: any) => fn({ getRepository: () => txRepo })),
    } as any;

    const svc = new SettingsService(profiles as any, ds);
    const out = await svc.create({ name: 'Default-ish' });

    expect(ds.transaction).toHaveBeenCalled();
    expect(txRepo.update).toHaveBeenCalledWith(
      { ownerKey: 'default', isDefault: true },
      { isDefault: false },
    );
    expect(out.isDefault).toBe(true);
  });

  it('create() with isDefault=false skips transaction and saves directly', async () => {
    const profiles = createMockRepo<GenerationSettingsProfileEntity>({
      count: jest.fn(async () => 5) as any,
    } as any);
    const ds = { transaction: jest.fn() } as any;
    const svc = new SettingsService(profiles as any, ds);

    const out = await svc.create({ name: 'A', isDefault: false });
    expect(ds.transaction).not.toHaveBeenCalled();
    expect((profiles as any).save).toHaveBeenCalled();
    expect(out.isDefault).toBe(false);
  });

  it('setDefaultById() is idempotent when already default', async () => {
    const profiles = createMockRepo<GenerationSettingsProfileEntity>({
      findOne: jest.fn(async () => ({ id: 'p1', ownerKey: 'default', isDefault: true })) as any,
    } as any);
    const ds = { transaction: jest.fn() } as any;
    const svc = new SettingsService(profiles as any, ds);

    const out = await svc.setDefaultById('p1');
    expect(out.id).toBe('p1');
    expect(ds.transaction).not.toHaveBeenCalled();
  });

  it('setDefaultById() unsets other defaults in a transaction', async () => {
    const profiles = createMockRepo<GenerationSettingsProfileEntity>({
      findOne: jest.fn(async () => ({ id: 'p2', ownerKey: 'default', isDefault: false })) as any,
    } as any);

    const txRepo = createTxRepoSeed();
    txRepo.findOne = jest.fn(async () => ({ id: 'p2', ownerKey: 'default', isDefault: true }));

    const ds = {
      transaction: jest.fn(async (fn: any) => fn({ getRepository: () => txRepo })),
    } as any;
    const svc = new SettingsService(profiles as any, ds);

    const out = await svc.setDefaultById('p2');
    expect(ds.transaction).toHaveBeenCalled();
    expect(txRepo.update).toHaveBeenCalledWith(
      { ownerKey: 'default', isDefault: true },
      { isDefault: false },
    );
    expect(txRepo.update).toHaveBeenCalledWith({ id: 'p2' }, { isDefault: true });
    expect(out.id).toBe('p2');
    expect(out.isDefault).toBe(true);
  });

  it('ensureDefaultProfile() creates baseline if none exist', async () => {
    const profiles = createMockRepo<GenerationSettingsProfileEntity>({
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null) // getDefault
        .mockResolvedValueOnce(null), // first profile
      count: jest.fn(async () => 0) as any,
    } as any);

    const txRepo = createTxRepoSeed();
    const ds = {
      transaction: jest.fn(async (fn: any) => fn({ getRepository: () => txRepo })),
    } as any;

    const svc = new SettingsService(profiles as any, ds);
    const out = await svc.ensureDefaultProfile('default');

    // Falls back to create(), which uses transaction because it's the first profile.
    expect(out.name).toBe('Default');
    expect(out.isDefault).toBe(true);
  });

  it('update() throws NotFound for missing profile', async () => {
    const profiles = createMockRepo<GenerationSettingsProfileEntity>();
    const ds = { transaction: jest.fn() } as any;
    const svc = new SettingsService(profiles as any, ds);
    await expect(svc.update('nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
