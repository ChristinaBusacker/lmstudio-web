import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import type { GenerationSettingsProfileEntity } from './entities/generation-settings-profile.entity';

type SettingsServiceMock = Pick<
  SettingsService,
  'list' | 'getById' | 'create' | 'deleteProfile' | 'update' | 'setDefaultById'
>;

describe('SettingsController', () => {
  let controller: SettingsController;
  let settings: jest.Mocked<SettingsServiceMock>;

  beforeEach(async () => {
    settings = {
      list: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      deleteProfile: jest.fn(),
      update: jest.fn(),
      setDefaultById: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: settings }],
    }).compile();

    controller = moduleRef.get(SettingsController);
  });

  it('listProfiles() maps entities to dtos', async () => {
    const profile: Partial<GenerationSettingsProfileEntity> = {
      id: 'p1',
      ownerKey: 'default',
      name: 'Default',
      params: { modelKey: 'm1' },
      isDefault: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    settings.list.mockResolvedValue([profile as GenerationSettingsProfileEntity]);

    const res = await controller.listProfiles();
    expect(res[0]).toEqual({
      id: 'p1',
      ownerKey: 'default',
      name: 'Default',
      params: { modelKey: 'm1' },
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('getById() throws NotFoundException if missing', async () => {
    settings.getById.mockResolvedValue(null);
    await expect(controller.getById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create() returns dto', async () => {
    const profile: Partial<GenerationSettingsProfileEntity> = {
      id: 'p2',
      ownerKey: 'default',
      name: 'New',
      params: {},
      isDefault: false,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    settings.create.mockResolvedValue(profile as GenerationSettingsProfileEntity);

    const res = await controller.create({ name: 'New', params: {}, isDefault: false });
    expect(res.id).toBe('p2');
  });

  it('delete() throws NotFoundException if profile missing', async () => {
    settings.getById.mockResolvedValue(null);
    await expect(controller.delete('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update() delegates to service', async () => {
    const profile: Partial<GenerationSettingsProfileEntity> = {
      id: 'p3',
      ownerKey: 'default',
      name: 'Updated',
      params: {},
      isDefault: false,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    };
    settings.update.mockResolvedValue(profile as GenerationSettingsProfileEntity);

    const res = await controller.update('p3', { name: 'Updated' });
    expect(settings.update).toHaveBeenCalledWith('p3', { name: 'Updated' });
    expect(res.name).toBe('Updated');
  });

  it('setDefault() delegates to service', async () => {
    const profile: Partial<GenerationSettingsProfileEntity> = {
      id: 'p4',
      ownerKey: 'default',
      name: 'Default',
      params: {},
      isDefault: true,
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
      updatedAt: new Date('2026-01-04T00:00:00.000Z'),
    };
    settings.setDefaultById.mockResolvedValue(profile as GenerationSettingsProfileEntity);

    const res = await controller.setDefault('p4');
    expect(settings.setDefaultById).toHaveBeenCalledWith('p4');
    expect(res.isDefault).toBe(true);
  });
});
