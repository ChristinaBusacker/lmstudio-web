/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ThreadVariant, ThreadMessage, ChatThreadResponse } from '@shared/contracts';

export class ThreadVariantDto implements ThreadVariant {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: Number }) variantIndex!: number;
  @ApiProperty({ type: Boolean }) isActive!: boolean;
  @ApiProperty({ type: String }) content!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Only present if includeReasoning=true',
  })
  reasoning?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
  })
  stats?: any | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class ThreadMessageDto implements ThreadMessage {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) chatId!: string;

  @ApiProperty({ enum: ['system', 'user', 'assistant'] })
  role!: 'system' | 'user' | 'assistant';

  @ApiPropertyOptional({ type: String, nullable: true })
  parentMessageId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  editedAt?: string | null;

  @ApiProperty({ type: Number, description: 'Number of variants stored for this message' })
  variantsCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: ThreadVariantDto })
  activeVariant!: ThreadVariantDto;
}

export class ChatThreadResponseDto implements ChatThreadResponse {
  @ApiProperty({ type: String })
  chatId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  title?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  folderId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  activeHeadMessageId?: string | null;

  @ApiProperty({ type: [ThreadMessageDto] })
  messages!: ThreadMessageDto[];
}
