import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Chat meta as exposed via the API.
 * (No messages included.)
 */
export class ChatMetaDto {
  @ApiProperty() id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  title!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  folderId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  activeHeadMessageId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;
}

/**
 * Response for activate-head.
 */
export class ActivateHeadResponseDto {
  @ApiProperty() chatId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  activeHeadMessageId!: string | null;
}

/**
 * Response for chat soft delete.
 */
export class SoftDeleteChatResponseDto {
  @ApiProperty() chatId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  deletedAt!: string;
}
