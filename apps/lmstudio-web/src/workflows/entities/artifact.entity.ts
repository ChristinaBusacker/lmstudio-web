/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ArtifactKind = 'json' | 'text' | 'image' | 'binary';

@Entity('artifact')
@Index(['workflowRunId'])
@Index(['nodeRunId'])
export class ArtifactEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  workflowRunId!: string;

  @Column({ type: 'varchar', nullable: true })
  nodeRunId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind!: ArtifactKind;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  filename!: string | null;

  @Column({ type: 'text', nullable: true })
  contentText!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  contentJson!: any | null;

  /**
   * Later: store large blobs on disk/S3 and keep the path here.
   */
  @Column({ type: 'varchar', nullable: true })
  blobPath!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
