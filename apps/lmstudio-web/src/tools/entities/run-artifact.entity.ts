/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type RunArtifactKind = 'json' | 'text' | 'binary';

/**
 * RunArtifactEntity
 *
 * Generic "artifact" storage for chat runs / tool executions.
 *
 * This mirrors the workflow ArtifactEntity, but is scoped to a chat-run (runId).
 */
@Entity('run_artifact')
@Index(['runId'])
export class RunArtifactEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  runId!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  toolName!: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind!: RunArtifactKind;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mimeType!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  filename!: string | null;

  @Column({ type: 'text', nullable: true })
  contentText!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  contentJson!: any | null;

  /**
   * Optional pointer to a blob on disk. For now: local file path.
   */
  @Column({ type: 'varchar', length: 500, nullable: true })
  blobPath!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
