/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ThreadVariantDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantIndex!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() content!: string;

  @ApiPropertyOptional({ description: 'Only present if includeReasoning=true' })
  reasoning?: string | null;

  @ApiPropertyOptional() stats?: any | null;

  @ApiProperty() createdAt!: string;
}

export class ThreadMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() chatId!: string;
  @ApiProperty({ enum: ['system', 'user', 'assistant'] })
  role!: 'system' | 'user' | 'assistant';

  @ApiPropertyOptional() parentMessageId?: string | null;

  @ApiPropertyOptional() deletedAt?: string | null;
  @ApiPropertyOptional() editedAt?: string | null;

  @ApiProperty({ description: 'Number of variants stored for this message' })
  variantsCount!: number;

  @ApiProperty() createdAt!: string;

  @ApiProperty({ type: ThreadVariantDto })
  activeVariant!: ThreadVariantDto;
}

export class ChatThreadResponseDto {
  @ApiProperty() chatId!: string;

  @ApiPropertyOptional() title?: string | null;
  @ApiPropertyOptional() folderId?: string | null;
  @ApiPropertyOptional() activeHeadMessageId?: string | null;

  @ApiProperty({ type: [ThreadMessageDto] })
  messages!: ThreadMessageDto[];
}
