import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChatDto {
  @ApiPropertyOptional({ example: 'My LM Studio Chat' })
  title?: string;
}
