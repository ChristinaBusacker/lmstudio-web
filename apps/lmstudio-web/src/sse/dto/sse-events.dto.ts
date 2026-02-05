import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Event types emitted via SSE.
 * Keep this stable; add new types over time without breaking old clients.
 */
export type SseEventType =
  | 'run.status'
  | 'variant.snapshot'
  // Workflows
  | 'workflow.run.status'
  | 'workflow.node-run.upsert'
  | 'workflow.artifact.created'
  | 'chat.meta.changed'
  | 'chat.thread.changed'
  | 'sidebar.changed'
  | 'models.changed'
  | 'heartbeat';

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
      'workflow.run.status',
      'workflow.node-run.upsert',
      'workflow.artifact.created',
      'chat.meta.changed',
      'chat.thread.changed',
      'sidebar.changed',
      'models.changed',
      'heartbeat',
    ],
  })
  type!: SseEventType;

  @ApiPropertyOptional({ description: 'Chat id (if the event is scoped to a chat).' })
  chatId?: string;

  @ApiPropertyOptional({ description: 'Workflow id (if the event is scoped to a workflow).' })
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

// ---------------------------------------------------------------------------------------------
// Workflow payloads
// ---------------------------------------------------------------------------------------------

export class WorkflowRunStatusEventPayloadDto {
  @ApiProperty({
    enum: ['queued', 'running', 'completed', 'failed', 'canceled'],
    description: 'Current workflow run status.',
  })
  status!: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

  @ApiPropertyOptional({ description: 'Current node id (if running).', nullable: true })
  currentNodeId?: string | null;

  @ApiPropertyOptional({ description: 'Error message if status=failed.', nullable: true })
  error?: string | null;

  @ApiPropertyOptional({
    description: 'Optional stats/metadata.',
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  stats?: Record<string, any> | null;
}

export class WorkflowNodeRunUpsertPayloadDto {
  @ApiProperty({ description: 'Node id.' })
  nodeId!: string;

  @ApiProperty({ enum: ['pending', 'running', 'completed', 'failed', 'stale'] })
  status!: 'pending' | 'running' | 'completed' | 'failed' | 'stale';

  @ApiPropertyOptional({ nullable: true })
  error?: string | null;

  @ApiPropertyOptional({ nullable: true })
  startedAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  finishedAt?: string | null;
}

export class WorkflowArtifactCreatedPayloadDto {
  @ApiProperty({ description: 'Artifact id.' })
  artifactId!: string;

  @ApiPropertyOptional({ description: 'Node id that produced the artifact.', nullable: true })
  nodeId?: string | null;

  @ApiProperty({ enum: ['json', 'text', 'image', 'binary'] })
  kind!: 'json' | 'text' | 'image' | 'binary';

  @ApiPropertyOptional({ nullable: true })
  mimeType?: string | null;

  @ApiPropertyOptional({ nullable: true })
  filename?: string | null;
}

/**
 * Payload for chat run status events.
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

export class VariantSnapshotEventPayloadDto {
  @ApiProperty({ description: 'Active content for the target assistant message (content so far).' })
  content!: string;

  @ApiPropertyOptional({
    description: 'Optional reasoning (if you choose to emit it).',
    nullable: true,
  })
  reasoning?: string | null;
}

export class ChatMetaChangedPayloadDto {
  @ApiPropertyOptional({
    description: 'Optional list of changed fields (for smarter clients).',
    example: ['title', 'folderId'],
    type: [String],
  })
  fields?: string[];

  @ApiPropertyOptional({
    description: 'Optional patch (only include changed values).',
    example: { title: 'My new title' },
    type: 'object',
    additionalProperties: true,
  })
  patch?: {
    title?: string | null;
    folderId?: string | null;
    activeHeadMessageId?: string | null;
    deletedAt?: string | null;
    defaultSettingsProfileId?: string | null;
  };
}

export class ChatThreadChangedPayloadDto {
  @ApiPropertyOptional({
    description: 'Optional hint why thread changed.',
    example: 'activate-head',
  })
  reason?: string;
}

export class SidebarChangedPayloadDto {
  @ApiPropertyOptional({
    description: 'Optional hint for UI.',
    example: 'folder-renamed',
  })
  reason?: string;

  @ApiPropertyOptional({
    description: 'Optional patch (only include changed values).',
    example: { title: 'My new title' },
    type: 'object',
    additionalProperties: true,
  })
  patch?: {
    title?: string | null;
    folderId?: string | null;
    activeHeadMessageId?: string | null;
    deletedAt?: string | null;
    defaultSettingsProfileId?: string | null;
  };
}

export class ModelsChangedPayloadDto {
  reason?:
    | 'model-loading-started'
    | 'model-loaded'
    | 'model-unloading-started'
    | 'model-unloaded'
    | 'model-load-failed'
    | 'model-unload-failed';
  modelId?: string;
  state?: 'loading' | 'loaded' | 'unloading' | 'not-loaded' | 'unknown';
  error?: string | null;
}

export class HeartbeatPayloadDto {
  @ApiProperty({ example: true })
  ok!: boolean;
}
