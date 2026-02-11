import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  HeartbeatPayload,
  RunState,
  RunStatusEventPayload,
  SseEnvelope,
  SseEventType,
  VariantSnapshotEventPayload,
  WorkflowRunStatusPayload,
} from '@shared/contracts';

/**
 * Envelope used for all SSE events.
 * This is what the frontend will parse from `event.data`.
 */
/**
 * Swagger/OpenAPI DTO for SSE envelopes.
 *
 * Important: The canonical (shared) typing lives in `@shared/contracts` as `SseEnvelope`.
 * This class only exists so Nest Swagger can reflect a concrete class.
 */
export class SseEnvelopeApiDto<
  TType extends SseEventType = SseEventType,
  TPayload = unknown,
> implements SseEnvelope<TType, TPayload> {
  @ApiProperty({
    description: 'Monotonically increasing event id (used for replay via Last-Event-ID).',
    example: 123,
  })
  id!: number;

  @ApiProperty({
    description: 'Event type.',
  })
  type!: TType;

  @ApiPropertyOptional({ description: 'Chat id (if the event is scoped to a chat).' })
  chatId?: string;

  @ApiPropertyOptional({ description: 'Workflow id (if event is scoped to a workflow).' })
  workflowId?: string;

  @ApiPropertyOptional({ description: 'Run id (if the event is related to a run).' })
  runId?: string;

  @ApiPropertyOptional({ description: 'Workflow node id (if the event is related to a node).' })
  nodeId?: string;

  @ApiPropertyOptional({ description: 'Artifact id (if the event is related to an artifact).' })
  artifactId?: string;

  @ApiPropertyOptional({
    description: 'Message id (if the event is related to a message/variant).',
  })
  messageId?: string;

  @ApiProperty({
    description: 'Event timestamp (ISO).',
    example: '2026-01-19T12:34:56.789Z',
  })
  ts!: string;

  @ApiProperty({
    description: 'Event payload (schema depends on event type).',
    type: 'object',
    additionalProperties: true,
  })
  payload!: TPayload;
}

export class RunStatusEventPayloadDto implements RunStatusEventPayload {
  @ApiProperty({
    enum: ['queued', 'running', 'completed', 'failed', 'canceled'],
    description: 'Current run status.',
  })
  status!: RunState;

  @ApiPropertyOptional({ description: 'Error message if status=failed.', nullable: true })
  error?: string | null;

  @ApiPropertyOptional({
    description: 'Optional stats/metadata (token usage etc).',
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  stats?: Record<string, any> | null;
}

export class WorkflowRunStatusPayloadDto implements WorkflowRunStatusPayload {
  @ApiProperty({
    enum: ['queued', 'running', 'completed', 'failed', 'canceled'],
  })
  status!: RunState;

  @ApiPropertyOptional({ nullable: true })
  currentNodeId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  error?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  stats?: Record<string, any> | null;
}

export class VariantSnapshotEventPayloadDto implements VariantSnapshotEventPayload {
  @ApiProperty({ description: 'Active content for the target assistant message (content so far).' })
  content!: string;

  @ApiPropertyOptional({
    description: 'Optional reasoning (if you choose to emit it).',
    nullable: true,
  })
  reasoning?: string | null;
}

export class HeartbeatPayloadDto implements HeartbeatPayload {
  @ApiProperty({ example: true })
  ok!: boolean;
}

/**
 * Backwards-compat type alias.
 * Prefer importing `SseEnvelope` / `SseEventType` directly from `@shared/contracts`.
 */
export type SseEnvelopeDto<
  TType extends SseEventType = SseEventType,
  TPayload = unknown,
> = SseEnvelope<TType, TPayload>;
