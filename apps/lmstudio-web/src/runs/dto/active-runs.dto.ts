import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListActiveRunsQueryDto {
  @ApiPropertyOptional({ description: 'Queue key', default: 'default' })
  @IsOptional()
  @IsString()
  queueKey?: string;

  @ApiPropertyOptional({ description: 'Max number of runs', default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
