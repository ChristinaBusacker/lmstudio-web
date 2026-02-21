import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class ExportedSettingsProfileDto {
  @ApiProperty({ description: 'Human readable profile name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Settings params payload (arbitrary JSON object)' })
  @IsObject()
  params!: Record<string, unknown>;
}

export class SettingsProfileExportBundleDto {
  @ApiProperty({ description: 'Schema version for forward compatibility' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ type: ExportedSettingsProfileDto })
  @ValidateNested()
  @Type(() => ExportedSettingsProfileDto)
  profile!: ExportedSettingsProfileDto;
}

export class SettingsProfileImportBundleDto {
  @ApiProperty({ description: 'Schema version for forward compatibility' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ type: ExportedSettingsProfileDto })
  @ValidateNested()
  @Type(() => ExportedSettingsProfileDto)
  profile!: ExportedSettingsProfileDto;

  @ApiPropertyOptional({
    required: false,
    description: 'Optional override name for the imported profile',
  })
  @IsOptional()
  @IsString()
  name?: string;
}
