export type WorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type WorkflowNodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale';

/**
 * v1 Workflow Graph
 *
 * Key rules:
 * - No persisted diagram edges.
 * - Each node has exactly ONE input (`inputFrom`) and ONE output (the node's full artifact).
 * - Execution order is derived from the dependencies implied by `inputFrom`.
 */
export type WorkflowGraph = {
  nodes: Array<{
    id: string;
    /** e.g. 'lmstudio.llm', 'workflow.condition', 'workflow.loop' */
    type: string;
    profileName?: string;
    prompt?: string;
    /**
     * If set, this node consumes the full output artifact of the referenced node.
     * This field defines the dependency and therefore the execution order.
     */
    inputFrom?: string | null;
    position?: { x: number; y: number };
  }>;
};

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
  inputSnapshot: unknown;
  outputText: string;
  outputJson: unknown;
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
