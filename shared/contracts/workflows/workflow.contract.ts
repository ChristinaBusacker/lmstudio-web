import type { WorkflowId, RunId, ModelId, ChatId } from '../common/id.contract';
import type { IsoDateTimeString } from '../common/datetime.contract';
import type { PagedResponse, PageRequest } from '../common/pagination.contract';
import type { JsonObject } from '@shared/types/json';
import type { WorkflowGraph } from '@shared/types/workflow-graph.types';

export type WorkflowStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'paused';

export type WorkflowStepStatus =
  | 'pending'
  | 'running'
  | 'queued'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'canceled'
  | 'paused';

export interface WorkflowStep {
  key: string;
  title: string;
  status: WorkflowStepStatus;
  startedAt?: IsoDateTimeString;
  finishedAt?: IsoDateTimeString;

  /**
   * Optional machine data for a step.
   */
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowListItem {
  id: WorkflowId;
  name: string;
  status: WorkflowStatus;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;

  /** Optional relations */
  runId?: RunId;
  chatId?: ChatId;
  modelId?: ModelId;
}

export interface WorkflowDetail extends WorkflowListItem {
  description?: string;
  steps: WorkflowStep[];
  meta?: Record<string, unknown>;
}

export interface ListWorkflowsRequest extends Partial<PageRequest> {
  status?: WorkflowStatus;
  q?: string;
}

export type ListWorkflowsResponse = PagedResponse<WorkflowListItem>;

export interface CreateWorkflowRequest {
  name: string;
  description?: string;

  chatId?: ChatId;
  modelId?: ModelId;

  /**
   * Arbitrary workflow config (v1-friendly).
   */
  config?: Record<string, unknown>;
}

export interface CreateWorkflowResponse {
  workflow: WorkflowDetail;
}

export interface GetWorkflowResponse {
  workflow: WorkflowDetail;
}

export interface CancelWorkflowResponse {
  workflow: Pick<WorkflowDetail, 'id' | 'status' | 'updatedAt'>;
}

export interface CreateWorkflowRunRequest {
  label?: string;
}

export interface ImportWorkflowBundleRequest {
  bundle: {
    workflow: {
      name?: string;
      description?: string | null;
      graph?: WorkflowGraph;
    };
    runs?: JsonObject[];
    nodeRuns?: JsonObject[];
    artifacts?: JsonObject[];
  };
  name?: string;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  graph?: WorkflowGraph;
}
