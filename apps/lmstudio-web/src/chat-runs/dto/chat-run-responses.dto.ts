import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Minimal run summary returned after enqueuing.
 * Keep this stable: it becomes the contract for the UI.
 */
export class EnqueueRunResponseDto {
  @ApiProperty({ description: 'Run id (queued)' })
  runId!: string;

  @ApiProperty({ description: 'Chat id the run belongs to' })
  chatId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'User message that triggered the run (may be null in edge cases)',
  })
  sourceMessageId!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Assistant message that receives the output (should not be null)',
  })
  targetMessageId!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Chat head message id at the moment the run was enqueued',
  })
  headMessageIdAtStart!: string | null;

  @ApiProperty({ description: 'Queue key (currently always "default")' })
  queueKey!: string;

  @ApiProperty({
    enum: ['queued', 'running', 'completed', 'failed', 'canceled'],
    description: 'Initial status after enqueuing',
  })
  status!: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
