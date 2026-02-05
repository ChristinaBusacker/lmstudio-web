import type {
  CreateWorkflowPayload,
  UpdateWorkflowPayload,
  CreateWorkflowRunPayload,
  ListWorkflowRunsQuery,
  WorkflowNodeRunStatus,
  ArtifactKind,
  WorkflowRunStatus,
} from './workflow.models';

export class LoadWorkflows {
  static readonly type = '[Workflows] Load Workflows';
}

export class LoadWorkflowById {
  static readonly type = '[Workflows] Load Workflow By Id';
  constructor(public readonly workflowId: string) {}
}

export class CreateWorkflow {
  static readonly type = '[Workflows] Create Workflow';
  constructor(public readonly payload: CreateWorkflowPayload) {}
}

export class UpdateWorkflow {
  static readonly type = '[Workflows] Update Workflow';
  constructor(
    public readonly workflowId: string,
    public readonly payload: UpdateWorkflowPayload,
  ) {}
}

// --------------------
// Runs
// --------------------

export class LoadWorkflowRuns {
  static readonly type = '[Workflows] Load Workflow Runs';
  constructor(public readonly query: ListWorkflowRunsQuery = {}) {}
}

export class StartWorkflowRun {
  static readonly type = '[Workflows] Start Workflow Run';
  constructor(
    public readonly workflowId: string,
    public readonly payload: CreateWorkflowRunPayload = {},
  ) {}
}

export class LoadWorkflowRunDetails {
  static readonly type = '[Workflows] Load Workflow Run Details';
  constructor(public readonly runId: string) {}
}

export class RerunWorkflowFromNode {
  static readonly type = '[Workflows] Rerun Workflow From Node';
  constructor(
    public readonly runId: string,
    public readonly nodeId: string,
  ) {}
}

// --------------------
// UI helpers
// --------------------

export class SetSelectedWorkflow {
  static readonly type = '[Workflows] Set Selected Workflow';
  constructor(public readonly workflowId: string | null) {}
}

export class SetSelectedRun {
  static readonly type = '[Workflows] Set Selected Run';
  constructor(public readonly runId: string | null) {}
}

export class ClearWorkflowErrors {
  static readonly type = '[Workflows] Clear Errors';
}

// --------------------
// SSE -> Store sync
// --------------------

export class ApplyWorkflowRunStatusFromSse {
  static readonly type = '[Workflows][SSE] Apply Run Status';

  constructor(
    public readonly payload: {
      workflowId: string;
      runId: string;
      status: WorkflowRunStatus;
      currentNodeId: string | null;
      stats: any;
      error: string | null;
    },
  ) {}
}

export class ApplyWorkflowNodeRunUpsertFromSse {
  static readonly type = '[Workflows][SSE] Upsert Node Run';

  constructor(
    public readonly payload: {
      workflowId: string;
      runId: string;
      nodeId: string;
      status: WorkflowNodeRunStatus;
      error: string | null;
      startedAt: string | null;
      finishedAt: string | null;
    },
  ) {}
}

export class ApplyWorkflowArtifactCreatedFromSse {
  static readonly type = '[Workflows][SSE] Artifact Created';

  constructor(
    public readonly payload: {
      workflowId: string;
      runId: string;
      artifactId: string;
      nodeId: string | null;
      kind: ArtifactKind;
      mimeType: string | null;
      filename: string | null;
    },
  ) {}
}
