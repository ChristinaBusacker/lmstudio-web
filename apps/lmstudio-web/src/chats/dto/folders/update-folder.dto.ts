import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateChatFolderDto {
  @ApiPropertyOptional({ description: 'Folder name', example: 'Personal' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
