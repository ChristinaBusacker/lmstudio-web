import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateChatFolderDto {
  @ApiProperty({ description: 'Folder name', example: 'Work' })
  @IsString()
  @MinLength(1)
  name!: string;
}
