import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * AssetEntity
 *
 * Small, pragmatic file store for "uploaded assets".
 *
 * - Files are stored on disk (data/assets/<id>.<ext?>)
 * - Metadata is stored in DB.
 *
 * This is intentionally minimal and can be replaced by S3 or a dedicated blob store later.
 */
@Entity('asset')
@Index(['sha256'])
export class AssetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 240 })
  originalFilename!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  mimeType!: string | null;

  @Column({ type: 'int' })
  sizeBytes!: number;

  @Column({ type: 'varchar', length: 64 })
  sha256!: string;

  /** Absolute or relative path on disk */
  @Column({ type: 'varchar', length: 500 })
  path!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
