import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatFolderDto {
  @ApiProperty() id!: string;

  @ApiProperty({ description: 'Folder display name', example: 'Work' })
  name!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  deletedAt!: string | null;
}
