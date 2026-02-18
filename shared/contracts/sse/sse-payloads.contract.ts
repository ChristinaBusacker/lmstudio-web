import type { JsonObject } from '../../types/json.types';
import { RunState, type RunStatus } from '../runs/run.contract';

export interface RunStatusEventPayload {
  status: RunState;
  error?: string | null;
  stats?: JsonObject | null;
}

/** Full snapshot variant occasionally emitted by the backend (legacy). */
export interface RunStatusSnapshotPayload {
  run: RunStatus;
}

export interface WorkflowRunStatusPayload {
  status: RunState;
  currentNodeId?: string | null;
  error?: string | null;
  stats?: JsonObject | null;
}

export interface VariantSnapshotEventPayload {
  content: string;
  reasoning?: string | null;
}

export interface HeartbeatPayload {
  ok: boolean;
}

/** Generic "something changed" payload used for UI refresh triggers. */
export interface ChangedEventPayload {
  reason?: string;
  fields?: string[];
  patch?: JsonObject;
  modelId?: string;
  state?: string;
}

export interface WorkflowNodeRunUpsertPayload {
  id: string;
  workflowRunId?: string;
  primaryArtifactId?: string;
  outputText?: string;
  outputJson?: JsonObject;
  inputSnapshot?: JsonObject;
  nodeId: string;
  status: RunState;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string | null;
}

export interface WorkflowArtifactCreatedPayload {
  artifactId: string;
  nodeId?: string | null;
  kind: 'json' | 'text' | 'image' | 'binary';
  mimeType?: string | null;
  filename?: string | null;
}

/** Tool loop events (emitted during a run). */
export interface RunToolCallPayload {
  runId: string;
  toolCallId: string;
  toolName: string;
  args: JsonObject;
}

export interface RunToolResultPayload {
  runId: string;
  toolCallId: string;
  toolName: string;
  result: JsonObject;
  artifactId: string | null;
}

export interface RunToolErrorPayload {
  runId: string;
  toolCallId: string;
  toolName: string;
  error: string;
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
