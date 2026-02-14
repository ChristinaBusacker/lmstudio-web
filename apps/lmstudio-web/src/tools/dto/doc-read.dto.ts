import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class DocReadRequestDto {
  @ApiPropertyOptional({ description: 'Read document from URL (http/https)', nullable: true })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'Read document from uploaded Asset id', nullable: true })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Optional chat runId to store a snapshot artifact',
  })
  @IsOptional()
  @IsString()
  runId?: string;
}

export class DocReadFileDto {
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) mimeType!: string | null;
  @ApiPropertyOptional({ nullable: true }) text!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'If parsing failed, error message' }) error!:
    | string
    | null;
}

export class DocReadResponseDto {
  @ApiPropertyOptional({ nullable: true }) sourceUrl!: string | null;
  @ApiPropertyOptional({ nullable: true }) sourceAssetId!: string | null;
  @ApiProperty({
    type: [DocReadFileDto],
    description: 'If ZIP, multiple files are returned; otherwise one entry.',
  })
  files!: DocReadFileDto[];
  @ApiPropertyOptional({
    nullable: true,
    description: 'Created artifact id (if runId was provided)',
  })
  artifactId!: string | null;
}
