export type SseEventType =
  | 'heartbeat'
  | 'run.status'
  | 'variant.snapshot'
  | 'sidebar.changed'
  | 'models.changed'
  | 'folders.changed'
  | 'chats.changed';

export interface SseEnvelopeDto<TPayload = any> {
  id: number;
  type: SseEventType;
  chatId?: string;
  runId?: string;
  messageId?: string;
  payload: TPayload;
  createdAt?: string;
}

/** Payloads */
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
