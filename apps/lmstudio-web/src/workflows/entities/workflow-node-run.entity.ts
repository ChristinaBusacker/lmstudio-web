/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type WorkflowNodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale';

@Entity('workflow_node_run')
@Index(['workflowRunId'])
@Index(['workflowRunId', 'nodeId', 'iteration'], { unique: true })
@Index(['status'])
export class WorkflowNodeRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  workflowRunId!: string;

  @Column({ type: 'varchar', length: 128 })
  nodeId!: string;

  @Column({ type: 'int', default: 0 })
  iteration!: number;

  @Column({ type: 'varchar', length: 16 })
  status!: WorkflowNodeRunStatus;

  @Column({ type: 'simple-json', nullable: true })
  inputSnapshot!: any | null; // resolved profile params + rendered prompt + upstream refs

  @Column({ type: 'text', nullable: true })
  outputText!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  outputJson!: any | null;

  @Column({ type: 'varchar', nullable: true })
  primaryArtifactId!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'datetime', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
