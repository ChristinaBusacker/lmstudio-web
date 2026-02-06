import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Event types emitted via SSE.
 * Keep this stable; add new types over time without breaking old clients.
 */
export type SseEventType =
  | 'run.status'
  | 'variant.snapshot'
  | 'chat.meta.changed'
  | 'chat.thread.changed'
  | 'sidebar.changed'
  | 'models.changed'
  | 'heartbeat'
  // Workflows
  | 'workflow.run.status'
  | 'workflow.node-run.upsert'
  | 'workflow.artifact.created';

/**
 * Envelope used for all SSE events.
 * This is what the frontend will parse from `event.data`.
 */
export class SseEnvelopeDto<TPayload = any> {
  @ApiProperty({
    description: 'Monotonically increasing event id (used for replay via Last-Event-ID).',
    example: 123,
  })
  id!: number;

  @ApiProperty({
    description: 'Event type.',
    enum: [
      'run.status',
      'variant.snapshot',
      'chat.meta.changed',
      'chat.thread.changed',
      'sidebar.changed',
      'models.changed',
      'heartbeat',
      'workflow.run.status',
      'workflow.node-run.upsert',
      'workflow.artifact.created',
    ],
  })
  type!: SseEventType;

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

/**
 * Payload for run status events (chat runs).
 */
export class RunStatusEventPayloadDto {
  @ApiProperty({
    enum: ['queued', 'running', 'completed', 'failed', 'canceled'],
    description: 'Current run status.',
  })
  status!: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

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

/**
 * Workflow run status payload.
 */
export class WorkflowRunStatusPayloadDto {
  @ApiProperty({
    enum: ['queued', 'running', 'completed', 'failed', 'canceled'],
  })
  status!: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

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

/**
 * Payload for variant snapshot events.
 * We send "content so far" for a single assistant message's active variant.
 */
export class VariantSnapshotEventPayloadDto {
  @ApiProperty({ description: 'Active content for the target assistant message (content so far).' })
  content!: string;

  @ApiPropertyOptional({
    description: 'Optional reasoning (if you choose to emit it).',
    nullable: true,
  })
  reasoning?: string | null;
}

/**
 * Payload for heartbeat events.
 */
export class HeartbeatPayloadDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}
