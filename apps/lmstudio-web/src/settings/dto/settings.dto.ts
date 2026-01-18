import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class SettingsProfileDto {
  @ApiProperty({ description: 'Profile id' })
  id!: string;

  @ApiProperty({
    description: 'Owner key (currently "default", later userId)',
    example: 'default',
  })
  ownerKey!: string;

  @ApiProperty({ description: 'Display name of the profile', example: 'Default' })
  name!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Stored generation parameters.',
    example: { modelKey: 'qwen2.5-7b-instruct', temperature: 0.7, maxTokens: 800, topP: 0.9 },
  })
  params!: Record<string, any>;

  @ApiProperty({ description: 'Whether this profile is the default for its ownerKey' })
  isDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class CreateSettingsProfileDto {
  @ApiProperty({ description: 'Display name of the profile' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Initial generation params (optional).',
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'If true, this profile becomes the default for the ownerKey.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateSettingsProfileDto {
  @ApiPropertyOptional({ description: 'Display name of the profile' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Updated generation params (optional).',
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, any>;

  @ApiPropertyOptional({ description: 'If true, becomes default for the ownerKey.' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
