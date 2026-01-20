import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RenameChatDto {
  @ApiProperty({ description: 'New chat title' })
  @IsString()
  @MinLength(1)
  title!: string;
}
