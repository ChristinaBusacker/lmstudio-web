import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import {
  Workflow,
  CreateWorkflowPayload,
  UpdateWorkflowPayload,
  CreateWorkflowRunPayload,
  WorkflowRun,
  ListWorkflowRunsQuery,
  WorkflowRunDetails,
} from '../state/workflows/workflow.models';

@Injectable({ providedIn: 'root' })
export class WorkflowApiService {
  constructor(private readonly http: HttpClient) {}

  // -----------------------
  // Workflows
  // -----------------------

  listWorkflows(): Observable<Workflow[]> {
    return this.http.get<Workflow[]>('/api/workflows');
  }

  getWorkflow(id: string): Observable<Workflow> {
    return this.http.get<Workflow>(`/api/workflows/${encodeURIComponent(id)}`);
  }

  createWorkflow(payload: CreateWorkflowPayload): Observable<Workflow> {
    return this.http.post<Workflow>('/api/workflows', payload);
  }

  updateWorkflow(id: string, payload: UpdateWorkflowPayload): Observable<Workflow> {
    return this.http.patch<Workflow>(`/api/workflows/${encodeURIComponent(id)}`, payload);
  }

  // -----------------------
  // Workflow Runs
  // -----------------------

  startRun(workflowId: string, payload: CreateWorkflowRunPayload = {}): Observable<WorkflowRun> {
    return this.http.post<WorkflowRun>(
      `/api/workflows/${encodeURIComponent(workflowId)}/runs`,
      payload,
    );
  }

  listRuns(query: ListWorkflowRunsQuery = {}): Observable<WorkflowRun[]> {
    const params: Record<string, string> = {};

    if (query.workflowId) params['workflowId'] = query.workflowId;
    if (query.status) params['status'] = query.status;
    if (typeof query.limit === 'number') params['limit'] = String(query.limit);

    return this.http.get<WorkflowRun[]>('/api/workflows/workflow-runs', { params });
  }

  getRun(runId: string): Observable<WorkflowRunDetails> {
    return this.http.get<WorkflowRunDetails>(
      `/api/workflows/workflow-runs/${encodeURIComponent(runId)}`,
    );
  }

  rerunFrom(runId: string, nodeId: string): Observable<WorkflowRun> {
    return this.http.post<WorkflowRun>(
      `/api/workflows/workflow-runs/${encodeURIComponent(runId)}/rerun-from/${encodeURIComponent(nodeId)}`,
      {},
    );
  }
}
