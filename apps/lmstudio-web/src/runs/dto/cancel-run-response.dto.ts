import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CancelRunResponseDto {
  @ApiProperty()
  runId!: string;

  @ApiProperty({
    enum: ['canceled', 'completed', 'failed', 'running', 'queued'],
    description:
      'Resulting status after cancel attempt. If already finished, status stays unchanged.',
  })
  status!: 'canceled' | 'completed' | 'failed' | 'running' | 'queued';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Optional info message (e.g. already finished).',
  })
  message!: string | null;
}
