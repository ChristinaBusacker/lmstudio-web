import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class MoveChatDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Target folder id. null removes folder assignment.',
    example: null,
  })
  @IsOptional()
  @IsUUID()
  folderId?: string | null;
}
