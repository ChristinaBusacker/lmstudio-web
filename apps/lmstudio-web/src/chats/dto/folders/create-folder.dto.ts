import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import type { CreateChatFolderRequest } from '@shared/contracts';

export class CreateChatFolderDto implements CreateChatFolderRequest {
  @ApiProperty({ description: 'Folder name', example: 'Work' })
  @IsString()
  @MinLength(1)
  name!: string;
}
