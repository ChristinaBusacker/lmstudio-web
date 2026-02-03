/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

@Entity('workflow_run')
@Index(['workflowId'])
@Index(['status', 'updatedAt'])
@Index(['ownerKey', 'createdAt'])
export class WorkflowRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  workflowId!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, default: 'default' })
  ownerKey!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: WorkflowRunStatus;

  /**
   * Current node id being executed (best-effort). Helps UI display progress.
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  currentNodeId!: string | null;

  /**
   * Optional label/tags for filtering in UI (later).
   */
  @Column({ type: 'varchar', length: 200, nullable: true })
  label!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  stats!: any | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  // Worker locking (same pattern as RunEntity)
  @Column({ type: 'varchar', length: 64, nullable: true })
  lockedBy!: string | null;

  @Column({ type: 'datetime', nullable: true })
  lockedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
