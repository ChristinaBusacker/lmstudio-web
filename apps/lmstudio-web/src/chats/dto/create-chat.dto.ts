import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateChatDto {
  @ApiPropertyOptional({ example: 'My LM Studio Chat' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}
