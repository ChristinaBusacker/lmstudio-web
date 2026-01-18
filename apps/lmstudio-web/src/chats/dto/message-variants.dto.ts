import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateVariantDto {
  @ApiProperty({ description: 'User-visible content for the new variant' })
  @IsString()
  @MinLength(1)
  content!: string;
}

export class ActivateVariantDto {
  @ApiProperty({ description: 'Variant id to activate for the message' })
  @IsString()
  variantId!: string;
}
