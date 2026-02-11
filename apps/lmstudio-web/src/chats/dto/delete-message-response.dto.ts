import { ApiProperty } from '@nestjs/swagger';
import type { SoftDeleteMessageResponse } from '@shared/contracts';

export class SoftDeleteMessageResponseDto implements SoftDeleteMessageResponse {
  @ApiProperty({ type: String })
  messageId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  deletedAt!: string;
}
