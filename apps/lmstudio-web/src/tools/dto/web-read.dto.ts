import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class WebReadRequestDto {
  @ApiProperty() @IsString() url!: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Optional chat runId to store a snapshot artifact',
  })
  @IsOptional()
  @IsString()
  runId?: string;
}

export class WebReadMetaDto {
  @ApiPropertyOptional({ nullable: true }) title!: string | null;
  @ApiPropertyOptional({ nullable: true }) author!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Published date/time if detected (ISO)' })
  publishedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) siteName!: string | null;
  @ApiPropertyOptional({ nullable: true }) lang!: string | null;
}

export class WebReadResponseDto {
  @ApiProperty() url!: string;
  @ApiProperty({ type: WebReadMetaDto }) meta!: WebReadMetaDto;
  @ApiProperty({ description: 'Cleaned main article text (best-effort)' }) text!: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Created artifact id (if runId was provided)',
  })
  artifactId!: string | null;
}
