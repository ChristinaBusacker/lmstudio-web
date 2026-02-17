/** Payloads */
export interface RunStatusPayload {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  stats?: unknown;
  error?: string | null;
}

export interface VariantSnapshotPayload {
  content: string;
  reasoning: string | null;
}
