import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class BranchChatDto {
  @ApiProperty({
    description:
      'The message id to branch from (the new chat will contain the chain up to and including this message).',
  })
  @IsString()
  @IsUUID()
  messageId!: string;
}

export class BranchChatResponseDto {
  @ApiProperty({ description: 'New chat id created by branching.' })
  chatId!: string;
}
