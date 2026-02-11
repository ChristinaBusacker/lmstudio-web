import { ApiProperty } from '@nestjs/swagger';
import type { DeleteChatFolderResponse } from '@shared/contracts';

export class DeleteChatFolderResponseDto implements DeleteChatFolderResponse {
  @ApiProperty() folderId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  deletedAt!: string;

  @ApiProperty({ description: 'How many chats were moved out of this folder' })
  affectedChats!: number;
}
