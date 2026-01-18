import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * JSON-like params bag for a settings profile.
 *
 * We keep it flexible, but still describe it in OpenAPI as
 * an object with arbitrary properties.
 */
export class SettingsParamsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Arbitrary LM Studio / generation parameters (server validated by runtime usage).',
    example: { modelKey: 'lmstudio-community/Meta-Llama-3-8B-Instruct', temperature: 0.7 },
  })
  @IsObject()
  // NOTE: class-validator cannot validate "Record<string, any>" deeply by default.
  // This at least ensures it's an object.
  value!: Record<string, any>;
}

export class SettingsProfileDto {
  @ApiProperty() id!: string;

  @ApiProperty()
  key!: string;

  @ApiPropertyOptional({ nullable: true })
  name!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Stored parameters for the profile.',
  })
  params!: Record<string, any>;

  @ApiProperty()
  isDefault!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
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

  // Optional: only if you want to expose ownerKey publicly later.
  // For now, keep it server-owned ("default") and omit this from DTO.
  // ownerKey?: string;
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

export class SetDefaultProfileDto {
  @ApiProperty({ description: 'Profile key to mark as default' })
  @IsString()
  @MinLength(1)
  key!: string;
}
