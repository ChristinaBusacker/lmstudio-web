import type { UnixMs } from '../common/datetime.contract';
import type { ChatId, RunId, WorkflowId } from '../common/id.contract';
import type { RunStatus } from '../runs/run.contract';
import type { WorkflowStatus, WorkflowStep } from '../workflows/workflow.contract';

/**
 * Canonical SSE event types.
 * Keep names stable; adding is cheap, renaming is expensive.
 */
export type SseEventType =
  // Canonical server events
  | 'chat.created'
  | 'chat.updated'
  | 'chat.message.created'
  | 'run.created'
  | 'run.updated'
  | 'run.progress'
  | 'workflow.created'
  | 'workflow.updated'
  | 'workflow.step.updated'
  | 'heartbeat'
  | 'run.status'
  | 'variant.snapshot'
  | 'sidebar.changed'
  | 'models.changed'
  | 'folders.changed'
  | 'chats.changed'
  | 'workflow.run.status'
  | 'workflow.node-run.upsert'
  | 'workflow.artifact.created';

export interface SseEnvelope<TType extends SseEventType = SseEventType, TPayload = unknown> {
  id: number;
  type: TType;
  ts: UnixMs | string; // your backend currently emits ISO string; allow both for now
  chatId?: string;
  workflowId?: string;
  runId?: string;
  nodeId?: string;
  artifactId?: string;
  messageId?: string;
  payload: TPayload;
  /** Optional server-created timestamp (ISO). */
  createdAt?: string;
}

/* Payloads */

export interface ChatCreatedPayload {
  chatId: ChatId;
}

export interface ChatUpdatedPayload {
  chatId: ChatId;
  title?: string;
  updatedAt?: string;
}

export interface ChatMessageCreatedPayload {
  chatId: ChatId;
  messageId: string; // MessageId branded type can be used here if you want
  role: 'system' | 'user' | 'assistant' | 'tool';
}

export interface RunCreatedPayload {
  runId: RunId;
  status: RunStatus;
}

export interface RunUpdatedPayload {
  runId: RunId;
  status: RunStatus;
  updatedAt?: string;
  error?: string;
}

export interface RunProgressPayload {
  runId: RunId;
  /**
   * 0..1 progress. If unknown, omit or set null in your server.
   */
  progress?: number;
  message?: string;
}

export interface WorkflowCreatedPayload {
  workflowId: WorkflowId;
  status: WorkflowStatus;
}

export interface WorkflowUpdatedPayload {
  workflowId: WorkflowId;
  status: WorkflowStatus;
  updatedAt?: string;
  error?: string;
}

export interface WorkflowStepUpdatedPayload {
  workflowId: WorkflowId;
  step: WorkflowStep;
}

/**
 * Discriminated union for all SSE events.
 * Great for frontend switch-case exhaustiveness.
 */
export type SseEvent =
  | SseEnvelope<'chat.created', ChatCreatedPayload>
  | SseEnvelope<'chat.updated', ChatUpdatedPayload>
  | SseEnvelope<'chat.message.created', ChatMessageCreatedPayload>
  | SseEnvelope<'run.created', RunCreatedPayload>
  | SseEnvelope<'run.updated', RunUpdatedPayload>
  | SseEnvelope<'run.progress', RunProgressPayload>
  | SseEnvelope<'workflow.created', WorkflowCreatedPayload>
  | SseEnvelope<'workflow.updated', WorkflowUpdatedPayload>
  | SseEnvelope<'workflow.step.updated', WorkflowStepUpdatedPayload>;

// Legacy name used in the frontend codebase.
export type SseEnvelopeDto<TPayload = any> = SseEnvelope<SseEventType, TPayload>;
