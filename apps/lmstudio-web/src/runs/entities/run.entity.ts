/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatEntity } from '../../chats/entities/chat.entity';
import type { RunStatus } from './run.types';

@Entity('run')
@Index(['queueKey', 'status', 'createdAt']) // queue scan
@Index(['chatId', 'createdAt']) // show runs per chat
@Index(['status', 'updatedAt']) // optional: monitoring
@Index(['queueKey', 'clientRequestId'], { unique: true }) // idempotency per queue
export class RunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  chatId!: string;

  @ManyToOne(() => ChatEntity, (c) => c.runs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatId' })
  chat!: ChatEntity;

  /**
   * Queue partition key.
   * For v1 you can set this to "default" (single queue),
   * later: userId for per-user queueing.
   */
  @Column({ type: 'varchar', length: 64, default: 'default' })
  queueKey!: string;

  /**
   * Client-generated UUID for idempotency, required.
   * Unique per (queueKey, clientRequestId).
   */
  @Column({ type: 'varchar', length: 64 })
  clientRequestId!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: RunStatus;

  /**
   * Selected settings profile (optional), but we always store snapshot.
   */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  settingsProfileId!: string | null;

  /**
   * Frozen settings used for this run. Stored as JSON text.
   */
  @Column({ type: 'simple-json' })
  settingsSnapshot!: {
    modelKey?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    // extend freely
  };

  /**
   * Optional prompt profile hash/snapshot references.
   * We'll add prompt tables later; for now keep placeholders.
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  promptProfileHash!: string | null;

  /**
   * Partial assistant output (incrementally persisted).
   * Final output can also live here; up to you.
   */
  @Column({ type: 'text', default: '' })
  content!: string;

  @Column({ type: 'simple-json', nullable: true })
  stats!: {
    stopReason?: string;
    predictedTokensCount?: number;
    timeToFirstTokenSec?: number;
    modelDisplayName?: string;
  } | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  /**
   * Worker lock info (helps later with multi-process or crash recovery).
   */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  lockedBy!: string | null;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  lockedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt!: Date | null;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  sourceMessageId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  targetMessageId!: string | null;

  /**
   * If the run created a new variant, store it here.
   * (Optional; helpful for UI deep-linking + auditing)
   */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  createdVariantId!: string | null;

  /**
   * Snapshot of the chat head at the start of the run.
   * Useful for debugging branching behavior.
   */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  headMessageIdAtStart!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
