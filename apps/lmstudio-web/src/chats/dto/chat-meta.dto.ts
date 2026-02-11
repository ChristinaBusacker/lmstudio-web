import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ChatMeta, ActivateHeadResponse, SoftDeleteChatResponse } from '@shared/contracts';

export class ChatMetaDto implements ChatMeta {
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

export class ActivateHeadResponseDto implements ActivateHeadResponse {
  @ApiProperty() chatId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  activeHeadMessageId!: string | null;
}

export class SoftDeleteChatResponseDto implements SoftDeleteChatResponse {
  @ApiProperty() chatId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  deletedAt!: string;
}
