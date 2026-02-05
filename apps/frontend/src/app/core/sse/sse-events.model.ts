export type SseEventType =
  | 'heartbeat'
  | 'run.status'
  | 'variant.snapshot'
  | 'sidebar.changed'
  | 'models.changed'
  | 'folders.changed'
  | 'chats.changed'
  // Workflows
  | 'workflow.run.status'
  | 'workflow.node-run.upsert'
  | 'workflow.artifact.created';

export interface SseEnvelopeDto<TPayload = any> {
  id: number;
  type: SseEventType;

  chatId?: string;

  workflowId?: string;
  runId?: string;

  nodeId?: string;
  artifactId?: string;

  messageId?: string;

  payload: TPayload;
  createdAt?: string;
}

/** Existing payloads */
export interface RunStatusPayload {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  stats?: any;
  error?: string | null;
}

export interface VariantSnapshotPayload {
  content: string;
  reasoning: string | null;
}

export interface HeartbeatPayload {
  ok: true;
}

/** Workflow payloads */
export interface WorkflowRunStatusPayload {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  currentNodeId?: string | null;
  stats?: any;
  error?: string | null;
}

export interface WorkflowNodeRunUpsertPayload {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stale';
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface WorkflowArtifactCreatedPayload {
  artifactId: string;
  nodeId?: string | null;
  kind: 'json' | 'text' | 'image' | 'binary';
  mimeType?: string | null;
  filename?: string | null;
}
