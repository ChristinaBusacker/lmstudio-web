import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GenerationSettingsProfileEntity } from './entities/generation-settings-profile.entity';

type Params = GenerationSettingsProfileEntity['params'];

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(GenerationSettingsProfileEntity)
    private readonly profiles: Repository<GenerationSettingsProfileEntity>,
  ) {}

  async list(ownerKey = 'default') {
    return this.profiles.find({ where: { ownerKey }, order: { updatedAt: 'DESC' } });
  }

  async getById(id: string) {
    return this.profiles.findOne({ where: { id } });
  }

  async getDefault(ownerKey = 'default') {
    return this.profiles.findOne({ where: { ownerKey, isDefault: true } });
  }

  async create(ownerKey: string, name: string, params: Params, makeDefault = false) {
    if (makeDefault) await this.clearDefault(ownerKey);

    const p = this.profiles.create({ ownerKey, name, params, isDefault: makeDefault });
    return this.profiles.save(p);
  }

  async update(id: string, patch: Partial<{ name: string; params: Params; isDefault: boolean }>) {
    const p = await this.getById(id);
    if (!p) return null;

    if (patch.isDefault === true) {
      await this.clearDefault(p.ownerKey);
      p.isDefault = true;
    }
    if (patch.isDefault === false) p.isDefault = false;

    if (patch.name !== undefined) p.name = patch.name;
    if (patch.params !== undefined) p.params = patch.params;

    return this.profiles.save(p);
  }

  private async clearDefault(ownerKey: string) {
    await this.profiles.update({ ownerKey, isDefault: true }, { isDefault: false });
  }
}
