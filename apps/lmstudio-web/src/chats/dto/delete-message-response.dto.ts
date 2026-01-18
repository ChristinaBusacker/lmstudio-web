import { ApiProperty } from '@nestjs/swagger';

export class SoftDeleteMessageResponseDto {
  @ApiProperty({ type: String })
  messageId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  deletedAt!: string;
}
