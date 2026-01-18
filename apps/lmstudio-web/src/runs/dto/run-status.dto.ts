/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RunStatusDto {
  @ApiProperty() id!: string;

  @ApiProperty() chatId!: string;

  @ApiProperty({ description: 'Queue key (currently always "default")' })
  queueKey!: string;

  @ApiProperty({
    enum: ['queued', 'running', 'completed', 'failed', 'canceled'],
  })
  status!: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

  @ApiPropertyOptional({ type: String, nullable: true })
  clientRequestId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  settingsProfileId!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Frozen settings snapshot used for the run.',
  })
  settingsSnapshot!: Record<string, any>;

  @ApiPropertyOptional({ type: String, nullable: true })
  sourceMessageId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  targetMessageId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  headMessageIdAtStart!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Worker instance id' })
  lockedBy!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lockedAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finishedAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Error message if status=failed',
  })
  error!: string | null;

  @ApiPropertyOptional({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'Optional model/token usage stats and other run metadata.',
  })
  stats!: any | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  createdVariantId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
