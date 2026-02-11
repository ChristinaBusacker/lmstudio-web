import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import type {
  CreateVariantRequest,
  ActivateVariantRequest,
  MessageVariant,
} from '@shared/contracts';

export class CreateVariantDto implements CreateVariantRequest {
  @ApiProperty({ description: 'User-visible content for the new variant' })
  @IsString()
  @MinLength(1)
  content!: string;
}

export class ActivateVariantDto implements ActivateVariantRequest {
  @ApiProperty({ description: 'Variant id to activate for the message' })
  @IsString()
  @MinLength(1)
  variantId!: string;
}

export class MessageVariantDto implements MessageVariant {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  messageId!: string;

  @ApiProperty({ type: Number })
  variantIndex!: number;

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({ type: String })
  content!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  reasoning!: string | null;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
  })
  stats!: any;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
