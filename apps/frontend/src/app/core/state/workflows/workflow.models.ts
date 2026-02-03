export type WorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type WorkflowNodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale';

export interface Workflow {
  id: string;
  ownerKey: string;
  name: string;
  description: string | null;
  graph: any;
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
  stats: any;
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
  inputSnapshot: any;
  outputText: string;
  outputJson: any;
  primaryArtifactId: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
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
  contentJson: any;
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
  graph: any;
}

export interface UpdateWorkflowPayload {
  name?: string;
  description?: string;
  graph?: any;
}

export interface CreateWorkflowRunPayload {
  label?: string;
}

export interface ListWorkflowRunsQuery {
  workflowId?: string;
  status?: WorkflowRunStatus;
  limit?: number;
}
