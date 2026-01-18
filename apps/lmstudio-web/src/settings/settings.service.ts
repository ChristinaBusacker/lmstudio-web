/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GenerationSettingsProfileEntity } from './entities/generation-settings-profile.entity';

export type CreateGenerationProfileInput = {
  ownerKey?: string; // default "default"
  name: string;
  params?: Record<string, any>;
  isDefault?: boolean;
};

export type UpdateGenerationProfileInput = {
  name?: string;
  params?: Record<string, any>;
  isDefault?: boolean;
};

/**
 * Service for generation settings profiles.
 *
 * Data model facts (based on GenerationSettingsProfileEntity):
 * - Profiles belong to an ownerKey (currently always "default", later userId).
 * - Exactly one profile can be default per ownerKey (enforced here via transaction).
 * - `params` is a JSON-like object stored via `simple-json` in SQLite.
 *
 * Main responsibilities:
 * - CRUD on profiles
 * - resolve default profile for an ownerKey
 * - set default profile (by id) in a safe/transactional way
 */
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(GenerationSettingsProfileEntity)
    private readonly profiles: Repository<GenerationSettingsProfileEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Returns the ownerKey used by most endpoints today.
   * Later you can pass userId in from auth context.
   */
  private normalizeOwnerKey(ownerKey?: string): string {
    const v = (ownerKey ?? 'default').trim();
    return v.length ? v : 'default';
  }

  /**
   * Ensures a profile name is valid and normalized.
   */
  private normalizeName(name: string): string {
    return (name ?? '').trim();
  }

  /**
   * Lists all profiles for an ownerKey.
   */
  async list(ownerKey?: string): Promise<GenerationSettingsProfileEntity[]> {
    const ok = this.normalizeOwnerKey(ownerKey);
    return this.profiles.find({
      where: { ownerKey: ok },
      order: { createdAt: 'ASC' as any },
    });
  }

  /**
   * Get profile by id.
   */
  async getById(id: string): Promise<GenerationSettingsProfileEntity | null> {
    return this.profiles.findOne({ where: { id } });
  }

  /**
   * Returns the current default profile for an ownerKey.
   *
   * NOTE: Your existing code calls getDefault('default'). We'll accept that for now:
   * - argument is treated as ownerKey
   */
  async getDefault(ownerKey: string): Promise<GenerationSettingsProfileEntity | null> {
    const ok = this.normalizeOwnerKey(ownerKey);
    return this.profiles.findOne({
      where: { ownerKey: ok, isDefault: true },
      order: { createdAt: 'ASC' as any },
    });
  }

  /**
   * Creates a new generation settings profile.
   *
   * If isDefault=true, the service ensures this becomes the ONLY default for the ownerKey.
   * If it's the first profile for that ownerKey, it can optionally become default automatically.
   */
  async create(input: CreateGenerationProfileInput): Promise<GenerationSettingsProfileEntity> {
    const ownerKey = this.normalizeOwnerKey(input.ownerKey);
    const name = this.normalizeName(input.name);
    if (!name) throw new BadRequestException('name must not be empty');

    const params = input.params ?? {};

    // Optional ergonomic behavior: first profile becomes default if not specified
    const existingCount = await this.profiles.count({ where: { ownerKey } });
    const shouldBeDefault = input.isDefault !== undefined ? input.isDefault : existingCount === 0;

    if (!shouldBeDefault) {
      const entity = this.profiles.create({
        ownerKey,
        name,
        params,
        isDefault: false,
      });
      return this.profiles.save(entity);
    }

    return this.dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(GenerationSettingsProfileEntity);

      // Unset any existing default(s) for this ownerKey
      await repo.update({ ownerKey, isDefault: true }, { isDefault: false });

      const entity = repo.create({
        ownerKey,
        name,
        params,
        isDefault: true,
      });

      return repo.save(entity);
    });
  }

  /**
   * Updates a generation settings profile by id.
   *
   * If isDefault is set to true, it becomes the ONLY default for its ownerKey.
   * If isDefault is set to false and it was default, you may end up with "no default".
   * In practice, prefer using setDefaultById() to change defaults.
   */
  async update(
    id: string,
    patch: UpdateGenerationProfileInput,
  ): Promise<GenerationSettingsProfileEntity> {
    const existing = await this.getById(id);
    if (!existing) throw new NotFoundException(`Settings profile not found: ${id}`);

    const nextName = patch.name !== undefined ? this.normalizeName(patch.name) : existing.name;
    if (patch.name !== undefined && !nextName) {
      throw new BadRequestException('name must not be empty');
    }

    const nextParams = patch.params !== undefined ? patch.params : existing.params;

    const wantsDefault = patch.isDefault;

    // Simple update if default flag doesn't change
    if (wantsDefault === undefined || wantsDefault === existing.isDefault) {
      await this.profiles.update(
        { id },
        {
          name: nextName,
          params: nextParams,
        },
      );
      return (await this.getById(id)) ?? existing;
    }

    // Default flag changes -> transaction to preserve "single default per ownerKey"
    return this.dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(GenerationSettingsProfileEntity);

      if (wantsDefault) {
        await repo.update({ ownerKey: existing.ownerKey, isDefault: true }, { isDefault: false });
        await repo.update({ id }, { name: nextName, params: nextParams, isDefault: true });
      } else {
        await repo.update({ id }, { name: nextName, params: nextParams, isDefault: false });
      }

      return (await repo.findOne({ where: { id } })) ?? existing;
    });
  }

  /**
   * Sets a profile as default by id.
   *
   * This is the recommended API semantics for your current schema:
   * - stable and unambiguous
   * - works well with ownerKey multi-tenant later
   */
  async setDefaultById(profileId: string): Promise<GenerationSettingsProfileEntity> {
    const existing = await this.getById(profileId);
    if (!existing) throw new NotFoundException(`Settings profile not found: ${profileId}`);

    if (existing.isDefault) return existing; // idempotent

    return this.dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(GenerationSettingsProfileEntity);

      await repo.update({ ownerKey: existing.ownerKey, isDefault: true }, { isDefault: false });

      await repo.update({ id: existing.id }, { isDefault: true });

      return (await repo.findOne({ where: { id: existing.id } })) ?? existing;
    });
  }

  /**
   * Ensures there is a default profile for an ownerKey.
   *
   * - If default exists -> return it
   * - Else if any profile exists -> mark oldest as default
   * - Else -> create a baseline "Default" profile
   */
  async ensureDefaultProfile(ownerKey?: string): Promise<GenerationSettingsProfileEntity> {
    const ok = this.normalizeOwnerKey(ownerKey);
    const current = await this.getDefault(ok);
    if (current) return current;

    const first = await this.profiles.findOne({
      where: { ownerKey: ok },
      order: { createdAt: 'ASC' as any },
    });

    if (first) return this.setDefaultById(first.id);

    return this.create({
      ownerKey: ok,
      name: 'Default',
      params: {},
      isDefault: true,
    });
  }
}
