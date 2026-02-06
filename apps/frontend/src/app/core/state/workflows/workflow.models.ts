export type WorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type WorkflowNodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale';

/**
 * Workflow Graph (v2)
 *
 * - Persisted: nodes[] + edges[]
 * - Input eines Nodes ergibt sich aus allen incoming edges.
 */
export type WorkflowGraph = {
  nodes: Array<{
    id: string;

    /**
     * e.g.
     * - 'lmstudio.llm'
     * - 'workflow.merge'
     * - 'workflow.export'
     * - 'ui.preview'
     * - 'workflow.condition'
     * - 'workflow.loop'
     */
    type: string;

    profileName?: string;
    prompt?: string;

    /**
     * Node-specific config. Stored as plain JSON to keep the graph extensible.
     */
    config?: any;

    position?: { x: number; y: number };

    /**
     * v1 legacy. Nicht mehr nutzen, nicht mehr speichern.
     * (Backend kann trotzdem legacy Graphen lesen und daraus edges ableiten.)
     */
    inputFrom?: never;
  }>;

  /** direction: source -> target */
  edges?: Array<{
    id: string;
    source: string;
    target: string;

    /**
     * Port ids are persisted so we can preserve ordering/UX
     * (e.g. merge inputs in-1..in-n).
     */
    sourcePort?: string;
    targetPort?: string;

    /**
     * Rendering metadata (ng-diagram stores markers/styles here).
     */
    type?: string;
    data?: any;

    [key: string]: any;
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
