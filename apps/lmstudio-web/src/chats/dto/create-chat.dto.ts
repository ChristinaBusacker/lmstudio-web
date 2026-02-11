import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';
import type { CreateChatRequest } from '@shared/contracts';

export class CreateChatDto implements CreateChatRequest {
  @ApiPropertyOptional({ example: 'My LM Studio Chat' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}
