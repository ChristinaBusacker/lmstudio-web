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
