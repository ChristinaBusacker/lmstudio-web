import { RunState } from '../runs/run.contract';

export interface RunStatusEventPayload {
  status: RunState;
  error?: string | null;
  stats?: Record<string, any> | null;
}

export interface WorkflowRunStatusPayload {
  status: RunState;
  currentNodeId?: string | null;
  error?: string | null;
  stats?: Record<string, any> | null;
}

export interface VariantSnapshotEventPayload {
  content: string;
  reasoning?: string | null;
}

export interface HeartbeatPayload {
  ok: boolean;
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
