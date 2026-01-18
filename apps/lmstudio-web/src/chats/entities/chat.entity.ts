import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { MessageEntity } from './message.entity';
import { RunEntity } from '../../runs/entities/run.entity';
import { ChatFolderEntity } from './chat-folder.entity';

@Entity('chat')
export class ChatEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title!: string | null;

  /**
   * Optional: default settings profile for this chat
   * (nice UX: chat remembers its generation style)
   */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  defaultSettingsProfileId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  folderId!: string | null;

  /**
   * Points to the current active head message (defines the active branch/path).
   */
  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  activeHeadMessageId!: string | null;

  @Index()
  @Column({ type: 'datetime', nullable: true })
  deletedAt!: Date | null;

  /**
   * Relations
   */

  @OneToMany(() => MessageEntity, (m) => m.chat, { cascade: false })
  messages!: MessageEntity[];

  @OneToMany(() => RunEntity, (r) => r.chat, { cascade: false })
  runs!: RunEntity[];

  @ManyToOne(() => ChatFolderEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'folderId' })
  folder!: ChatFolderEntity | null;
}
