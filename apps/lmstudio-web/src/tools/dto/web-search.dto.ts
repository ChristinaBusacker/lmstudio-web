import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class WebSearchQueryDto {
  @ApiProperty({ description: 'Search query' })
  @IsString()
  q!: string;

  @ApiPropertyOptional({ description: 'Max results', default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Optional chat runId to store a snapshot artifact',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  runId?: string;
}

export class WebSearchResultItemDto {
  @ApiProperty() title!: string;
  @ApiProperty() url!: string;
  @ApiPropertyOptional({ nullable: true }) snippet!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Published date if known (ISO)' })
  publishedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Source engine/provider' }) engine!:
    | string
    | null;
}

export class WebSearchResponseDto {
  @ApiProperty() query!: string;
  @ApiProperty({ type: [WebSearchResultItemDto] }) results!: WebSearchResultItemDto[];
  @ApiPropertyOptional({
    nullable: true,
    description: 'Created artifact id (if runId was provided)',
  })
  artifactId!: string | null;
}
