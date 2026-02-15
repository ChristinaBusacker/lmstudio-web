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

export type ExternalServiceName = 'lmstudio' | 'searxng';

export interface ExternalServiceStatus {
  name: ExternalServiceName;
  /** Whether the service is configured/enabled (e.g. env present). */
  enabled: boolean;
  /** Whether the service is reachable and responding. */
  ok: boolean;
  baseUrl?: string | null;
  checkedAt: string;
  /** Optional human readable error. */
  error?: string | null;
}

export interface ExternalStatusEventPayload {
  services: ExternalServiceStatus[];
}
