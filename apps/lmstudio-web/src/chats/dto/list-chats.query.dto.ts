import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListChatsQueryDto {
  @ApiPropertyOptional({ description: 'Max number of chats', default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Cursor for pagination (updatedAt ISO string of the last item from previous page).',
    example: '2026-01-18T10:12:34.567Z',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filter by folderId. Use the literal string "null" to get chats without a folder.',
    example: 'null',
  })
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiPropertyOptional({ description: 'Include soft-deleted chats', default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDeleted?: boolean;
}
