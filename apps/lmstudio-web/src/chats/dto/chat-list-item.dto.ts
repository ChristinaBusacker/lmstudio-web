import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ChatListItem } from '@shared/contracts';

export class ChatListItemDto implements ChatListItem {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  title!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  folderId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  activeHeadMessageId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  defaultSettingsProfileId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
