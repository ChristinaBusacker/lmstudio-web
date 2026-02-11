import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import type { UpdateChatFolderRequest } from '@shared/contracts';

export class UpdateChatFolderDto implements UpdateChatFolderRequest {
  @ApiPropertyOptional({ description: 'Folder name', example: 'Personal' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
