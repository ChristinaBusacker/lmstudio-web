import { ApiProperty } from '@nestjs/swagger';

export class DeleteChatFolderResponseDto {
  @ApiProperty() folderId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  deletedAt!: string;

  @ApiProperty({ description: 'How many chats were moved out of this folder' })
  affectedChats!: number;
}
