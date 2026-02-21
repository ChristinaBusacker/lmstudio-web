import { ApiProperty } from '@nestjs/swagger';
import { JsonObject } from '@shared/index';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExportedVariantDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsInt()
  variantIndex!: number;

  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;

  @ApiProperty()
  @IsString()
  content!: string;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  reasoning!: string | null;

  @ApiProperty({ nullable: true, description: 'Arbitrary stats payload' })
  @IsOptional()
  // stats is arbitrary JSON, we accept it as-is.
  stats!: JsonObject | null;

  @ApiProperty()
  @IsString()
  createdAt!: string;
}

export class ExportedMessageDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  parentMessageId!: string | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  deletedAt!: string | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  editedAt!: string | null;

  @ApiProperty()
  @IsString()
  createdAt!: string;

  @ApiProperty({ type: [ExportedVariantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExportedVariantDto)
  variants!: ExportedVariantDto[];
}

export class ChatExportBundleDto {
  @ApiProperty({ description: 'Schema version for forward compatibility' })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  title!: string | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  defaultSettingsProfileId!: string | null;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  activeHeadMessageId!: string | null;

  // Timestamps are exported for completeness. Accept as ISO strings.
  @ApiProperty()
  @IsString()
  createdAt!: string;

  @ApiProperty()
  @IsString()
  updatedAt!: string;

  @ApiProperty({ type: [ExportedMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExportedMessageDto)
  messages!: ExportedMessageDto[];
}
