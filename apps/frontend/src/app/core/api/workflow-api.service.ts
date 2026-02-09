import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
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

  deleteWorkflow(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/api/workflows/${encodeURIComponent(id)}`);
  }

  importWorkflowBundle(bundle: unknown, name?: string): Observable<Workflow> {
    return this.http.post<Workflow>('/api/workflows/import', { bundle, name });
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
    let params = new HttpParams();

    if (query.workflowId) params = params.set('workflowId', query.workflowId);
    if (query.status) params = params.set('status', query.status);
    if (typeof query.limit === 'number') params = params.set('limit', String(query.limit));

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
