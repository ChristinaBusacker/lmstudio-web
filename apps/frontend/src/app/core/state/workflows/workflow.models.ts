import type { WorkflowGraph as SharedWorkflowGraph } from '@shared/index';

export type WorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled';
export type WorkflowNodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale';

/**
 * Workflow Graph (v2)
 *
 * - Persisted: nodes[] + edges[]
 * - Input eines Nodes ergibt sich aus allen incoming edges.
 */
export type WorkflowGraph = SharedWorkflowGraph;

export interface Workflow {
  id: string;
  ownerKey: string;
  name: string;
  description: string | null;
  graph: WorkflowGraph;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  ownerKey: string;
  status: WorkflowRunStatus;
  currentNodeId: string | null;
  label: string | null;
  stats: unknown;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNodeRun {
  id: string;
  workflowRunId: string;
  nodeId: string;
  status: WorkflowNodeRunStatus;
  inputSnapshot: WorkflowNodeRunInputSnapshot | null;
  outputText: string;
  outputJson: unknown;
  primaryArtifactId: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface WorkflowNodeRunInputSnapshot {
  sources: string[];
  filename?: string;
  note: string;
  loop?: {
    maxIterations: number;
    joiner: string;
    mode: string;
  };
  conditionPrompt?: string;
  toolName: string;
}

export type ArtifactKind = 'json' | 'text' | 'image' | 'binary';

export interface Artifact {
  id: string;
  workflowRunId: string;
  nodeRunId: string | null;
  kind: ArtifactKind;
  mimeType: string | null;
  filename: string | null;
  contentText: string | null;
  contentJson: unknown;
  blobPath: string | null;
  createdAt: string;
}

export interface WorkflowRunDetails {
  run: WorkflowRun;
  nodeRuns: WorkflowNodeRun[];
  artifacts: Artifact[];
}

export interface CreateWorkflowPayload {
  name: string;
  description?: string;
  graph: WorkflowGraph;
}

export interface UpdateWorkflowPayload {
  name?: string;
  description?: string;
  graph?: WorkflowGraph;
}

export interface CreateWorkflowRunPayload {
  label?: string;
}

export interface ListWorkflowRunsQuery {
  workflowId?: string;
  status?: WorkflowRunStatus;
  limit?: number;
}
