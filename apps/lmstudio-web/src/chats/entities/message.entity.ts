import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ChatEntity } from './chat.entity';
import type { MessageRole } from './message.types';

@Entity('message')
@Index(['chatId', 'createdAt']) // Fast chat timeline queries (UI)
@Index(['chatId', 'parentMessageId']) // Fast "children of node" queries (branching UI)
export class MessageEntity {
  /**
   * Message node id (tree node).
   */
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Owning chat id.
   */
  @Index()
  @Column({ type: 'varchar', length: 36 })
  chatId!: string;

  /**
   * ORM relation convenience.
   * The DB truth is chatId; this is for joins and relation loading.
   */
  @ManyToOne(() => ChatEntity, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chatId' })
  chat!: ChatEntity;

  /**
   * Node role in the conversation.
   * Content is stored in MessageVariantEntity (variants-only design).
   */
  @Column({ type: 'varchar', length: 16 })
  role!: MessageRole;

  /**
   * Parent node in the conversation tree.
   * - null means this node is a root (first message in a chat/branch).
   * - branching is achieved by creating a new node whose parentMessageId points
   *   to an arbitrary earlier node.
   */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  parentMessageId!: string | null;

  /**
   * Soft delete marker.
   * The node stays in the tree to keep branches stable, but is excluded from
   * default context building.
   */
  @Index()
  @Column({ type: 'datetime', nullable: true })
  deletedAt!: Date | null;

  /**
   * Set when the user edits the message (typically by creating a new active variant).
   * Useful for UI badges/audit and for invalidating derived data.
   */
  @Index()
  @Column({ type: 'datetime', nullable: true })
  editedAt!: Date | null;

  /**
   * Creation timestamp.
   */
  @CreateDateColumn()
  createdAt!: Date;
}
