import { NodeDiagramModel } from '@shared/types/node-model.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('workflow')
@Index(['ownerKey', 'name'])
export class WorkflowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, default: 'default' })
  ownerKey!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Blueprint graph JSON: { nodes: [...], edges: [...] }
   */
  @Column({ type: 'simple-json' })
  graph!: NodeDiagramModel;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
