import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Reusable generation settings preset.
 * ownerKey can be userId later; for now it can be "default".
 */
@Entity('generation_settings_profile')
@Index(['ownerKey', 'isDefault'])
export class GenerationSettingsProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, default: 'default' })
  ownerKey!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  /**
   * JSON settings: temperature, maxTokens, topP, modelKey, etc.
   * Stored as text in sqlite; in Postgres later we'd switch to jsonb.
   */
  @Column({ type: 'simple-json' })
  params!: {
    modelKey?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    // extend freely
  };

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
