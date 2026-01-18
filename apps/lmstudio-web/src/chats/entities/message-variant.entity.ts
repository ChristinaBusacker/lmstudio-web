/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MessageEntity } from './message.entity';

@Entity('message_variant')
@Index(['messageId', 'variantIndex'], { unique: true })
@Index(['messageId', 'isActive'])
export class MessageVariantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  messageId!: string;

  @ManyToOne(() => MessageEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message!: MessageEntity;

  @Column({ type: 'int' })
  variantIndex!: number;

  @Column({ type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'text', nullable: true })
  reasoning!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  stats!: any | null;

  @CreateDateColumn()
  createdAt!: Date;
}
