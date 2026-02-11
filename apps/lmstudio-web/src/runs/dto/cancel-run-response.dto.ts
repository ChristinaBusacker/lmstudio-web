import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CancelRunResponse, RunState } from '@shared/contracts';

class CancelRunSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['queued', 'running', 'completed', 'failed', 'cancelled'] })
  status!: RunState;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class CancelRunResponseDto implements CancelRunResponse {
  @ApiProperty({ type: CancelRunSummaryDto })
  run!: CancelRunSummaryDto;

  @ApiPropertyOptional({ type: String, nullable: true })
  message?: string | null;
}
