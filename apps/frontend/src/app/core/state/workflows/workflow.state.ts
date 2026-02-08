/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { catchError, finalize, tap } from 'rxjs/operators';
import { EMPTY } from 'rxjs';

import { WorkflowApiService } from '../../api/workflow-api.service';
import type {
  Workflow,
  WorkflowRun,
  WorkflowRunDetails,
  WorkflowNodeRun,
  Artifact,
} from './workflow.models';
import {
  LoadWorkflows,
  LoadWorkflowById,
  CreateWorkflow,
  UpdateWorkflow,
  LoadWorkflowRuns,
  StartWorkflowRun,
  LoadWorkflowRunDetails,
  RerunWorkflowFromNode,
  SetSelectedWorkflow,
  SetSelectedRun,
  ClearWorkflowErrors,
  ApplyWorkflowRunStatusFromSse,
  ApplyWorkflowNodeRunUpsertFromSse,
  ApplyWorkflowArtifactCreatedFromSse,
  DeleteWorkflow,
} from './workflow.actions';
import { Router } from '@angular/router';

export interface WorkflowsStateModel {
  workflows: Workflow[];
  workflowsById: Record<string, Workflow>;

  runs: WorkflowRun[];
  runsById: Record<string, WorkflowRun>;

  // Details are heavier, keep separate
  runDetailsById: Record<string, WorkflowRunDetails>;

  selectedWorkflowId: string | null;
  selectedRunId: string | null;

  isLoadingWorkflows: boolean;
  isLoadingRuns: boolean;
  isLoadingRunDetails: boolean;

  error: string | null;
}

@State<WorkflowsStateModel>({
  name: 'workflows',
  defaults: {
    workflows: [],
    workflowsById: {},

    runs: [],
    runsById: {},

    runDetailsById: {},

    selectedWorkflowId: null,
    selectedRunId: null,

    isLoadingWorkflows: false,
    isLoadingRuns: false,
    isLoadingRunDetails: false,

    error: null,
  },
})
@Injectable()
export class WorkflowsState {
  constructor(
    private readonly api: WorkflowApiService,
    private readonly router: Router,
  ) {}

  // --------------------
  // Selectors
  // --------------------

  @Selector()
  static workflows(state: WorkflowsStateModel) {
    return state.workflows;
  }

  @Selector()
  static selectedWorkflow(state: WorkflowsStateModel) {
    const id = state.selectedWorkflowId;
    return id ? (state.workflowsById[id] ?? null) : null;
  }

  @Selector()
  static runs(state: WorkflowsStateModel) {
    return state.runs;
  }

  @Selector()
  static selectedRun(state: WorkflowsStateModel) {
    const id = state.selectedRunId;
    return id ? (state.runsById[id] ?? null) : null;
  }

  @Selector()
  static selectedRunDetails(state: WorkflowsStateModel) {
    const id = state.selectedRunId;
    return id ? (state.runDetailsById[id] ?? null) : null;
  }

  @Selector()
  static loading(state: WorkflowsStateModel) {
    return {
      workflows: state.isLoadingWorkflows,
      runs: state.isLoadingRuns,
      runDetails: state.isLoadingRunDetails,
    };
  }

  @Selector()
  static error(state: WorkflowsStateModel) {
    return state.error;
  }

  // --------------------
  // Actions: Workflows
  // --------------------

  @Action(LoadWorkflows)
  loadWorkflows(ctx: StateContext<WorkflowsStateModel>) {
    ctx.patchState({ isLoadingWorkflows: true, error: null });

    return this.api.listWorkflows().pipe(
      tap((workflows) => {
        const byId: Record<string, Workflow> = {};
        for (const w of workflows) byId[w.id] = w;

        ctx.patchState({ workflows, workflowsById: byId });
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return EMPTY;
      }),
      finalize(() => ctx.patchState({ isLoadingWorkflows: false })),
    );
  }

  @Action(LoadWorkflowById)
  loadWorkflowById(ctx: StateContext<WorkflowsStateModel>, action: LoadWorkflowById) {
    ctx.patchState({ error: null });

    return this.api.getWorkflow(action.workflowId).pipe(
      tap((wf) => {
        const s = ctx.getState();
        ctx.patchState({
          workflowsById: { ...s.workflowsById, [wf.id]: wf },
          workflows: this.upsertListById(s.workflows, wf),
        });
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return EMPTY;
      }),
    );
  }

  @Action(CreateWorkflow)
  createWorkflow(ctx: StateContext<WorkflowsStateModel>, action: CreateWorkflow) {
    ctx.patchState({ error: null });

    return this.api.createWorkflow(action.payload).pipe(
      tap((wf) => {
        const s = ctx.getState();
        ctx.patchState({
          workflowsById: { ...s.workflowsById, [wf.id]: wf },
          workflows: [wf, ...s.workflows.filter((x) => x.id !== wf.id)],
          selectedWorkflowId: wf.id,
        });
        void this.router.navigate(['/workflow', wf.id]);
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return EMPTY;
      }),
    );
  }

  @Action(UpdateWorkflow)
  updateWorkflow(ctx: StateContext<WorkflowsStateModel>, action: UpdateWorkflow) {
    ctx.patchState({ error: null });

    return this.api.updateWorkflow(action.workflowId, action.payload).pipe(
      tap((wf) => {
        const s = ctx.getState();
        ctx.patchState({
          workflowsById: { ...s.workflowsById, [wf.id]: wf },
          workflows: this.upsertListById(s.workflows, wf),
        });
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return EMPTY;
      }),
    );
  }

  @Action(DeleteWorkflow)
  deleteWorkflow(ctx: StateContext<WorkflowsStateModel>, action: DeleteWorkflow) {
    ctx.patchState({ error: null });

    return this.api.deleteWorkflow(action.workflowId).pipe(
      tap((response: { ok: boolean }) => {
        if (response) {
          ctx.dispatch(new LoadWorkflows());
        }
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return EMPTY;
      }),
    );
  }

  @Action(SetSelectedWorkflow)
  setSelectedWorkflow(ctx: StateContext<WorkflowsStateModel>, action: SetSelectedWorkflow) {
    ctx.patchState({ selectedWorkflowId: action.workflowId });
  }

  // --------------------
  // Actions: Runs
  // --------------------

  @Action(LoadWorkflowRuns)
  loadWorkflowRuns(ctx: StateContext<WorkflowsStateModel>, action: LoadWorkflowRuns) {
    ctx.patchState({ isLoadingRuns: true, error: null });

    return this.api.listRuns(action.query).pipe(
      tap((runs) => {
        const byId: Record<string, WorkflowRun> = {};
        for (const r of runs) byId[r.id] = r;

        ctx.patchState({
          runs,
          runsById: byId,
        });
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return EMPTY;
      }),
      finalize(() => ctx.patchState({ isLoadingRuns: false })),
    );
  }

  @Action(StartWorkflowRun)
  startWorkflowRun(ctx: StateContext<WorkflowsStateModel>, action: StartWorkflowRun) {
    ctx.patchState({ error: null });

    return this.api.startRun(action.workflowId, action.payload).pipe(
      tap((run) => {
        // immediate optimistic insert (SSE will follow anyway)
        const s = ctx.getState();
        ctx.patchState({
          runsById: { ...s.runsById, [run.id]: run },
          runs: [run, ...s.runs.filter((x) => x.id !== run.id)],
          selectedRunId: run.id,
        });
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return EMPTY;
      }),
    );
  }

  @Action(LoadWorkflowRunDetails)
  loadWorkflowRunDetails(ctx: StateContext<WorkflowsStateModel>, action: LoadWorkflowRunDetails) {
    ctx.patchState({ isLoadingRunDetails: true, error: null });

    return this.api.getRun(action.runId).pipe(
      tap((details) => {
        const s = ctx.getState();
        const run = details.run;

        ctx.patchState({
          runDetailsById: { ...s.runDetailsById, [action.runId]: details },
          runsById: { ...s.runsById, [run.id]: run },
          runs: this.upsertListById(s.runs, run),
        });
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return EMPTY;
      }),
      finalize(() => ctx.patchState({ isLoadingRunDetails: false })),
    );
  }

  @Action(RerunWorkflowFromNode)
  rerunFromNode(ctx: StateContext<WorkflowsStateModel>, action: RerunWorkflowFromNode) {
    ctx.patchState({ error: null });

    return this.api.rerunFrom(action.runId, action.nodeId).pipe(
      tap((updatedRun) => {
        const s = ctx.getState();

        // Drop cached details because they're now stale
        const newDetails = { ...s.runDetailsById };
        delete newDetails[action.runId];

        ctx.patchState({
          runsById: { ...s.runsById, [updatedRun.id]: updatedRun },
          runs: this.upsertListById(s.runs, updatedRun),
          runDetailsById: newDetails,
          selectedRunId: updatedRun.id,
        });
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return EMPTY;
      }),
    );
  }

  @Action(SetSelectedRun)
  setSelectedRun(ctx: StateContext<WorkflowsStateModel>, action: SetSelectedRun) {
    ctx.patchState({ selectedRunId: action.runId });
  }

  @Action(ClearWorkflowErrors)
  clearErrors(ctx: StateContext<WorkflowsStateModel>) {
    ctx.patchState({ error: null });
  }

  // --------------------
  // Actions: SSE
  // --------------------

  @Action(ApplyWorkflowRunStatusFromSse)
  applyWorkflowRunStatusFromSse(
    ctx: StateContext<WorkflowsStateModel>,
    action: ApplyWorkflowRunStatusFromSse,
  ) {
    const s = ctx.getState();
    const p = action.payload;

    const existing = s.runsById[p.runId];

    // If we never loaded it via REST yet, create a minimal synthetic run so the list can show it instantly.
    const nowIso = new Date().toISOString();
    const base: WorkflowRun =
      existing ??
      ({
        id: p.runId,
        workflowId: p.workflowId,
        ownerKey: '',
        status: p.status,
        currentNodeId: p.currentNodeId,
        label: null,
        stats: p.stats ?? null,
        error: p.error ?? null,
        startedAt: null,
        finishedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      } as WorkflowRun);

    const merged: WorkflowRun = {
      ...base,
      workflowId: base.workflowId || p.workflowId,
      status: p.status ?? base.status,
      currentNodeId: p.currentNodeId ?? base.currentNodeId,
      stats: p.stats ?? base.stats,
      error: p.error ?? base.error,
      updatedAt: nowIso,
    };

    // keep runs array unique + newest first
    const runs = [merged, ...s.runs.filter((x) => x.id !== merged.id)];
    const runsById = { ...s.runsById, [merged.id]: merged };

    // If details are cached, update the embedded run too
    const details = s.runDetailsById[merged.id];
    const runDetailsById = details
      ? { ...s.runDetailsById, [merged.id]: { ...details, run: merged } }
      : s.runDetailsById;

    ctx.patchState({ runs, runsById, runDetailsById });
  }

  @Action(ApplyWorkflowNodeRunUpsertFromSse)
  applyWorkflowNodeRunUpsertFromSse(
    ctx: StateContext<WorkflowsStateModel>,
    action: ApplyWorkflowNodeRunUpsertFromSse,
  ) {
    const s = ctx.getState();
    const p = action.payload;

    const details = s.runDetailsById[p.runId];
    if (!details) return; // only update heavy details if they are loaded/open

    const existing = details.nodeRuns.find((nr) => nr.nodeId === p.nodeId);

    const merged: WorkflowNodeRun = existing
      ? {
          ...existing,
          status: p.status,
          error: p.error,
          startedAt: p.startedAt ?? existing.startedAt,
          finishedAt: p.finishedAt ?? existing.finishedAt,
        }
      : ({
          id: `sse:${p.runId}:${p.nodeId}`,
          workflowRunId: p.runId,
          nodeId: p.nodeId,
          status: p.status,
          inputSnapshot: null,
          outputText: '',
          outputJson: null,
          primaryArtifactId: null,
          error: p.error,
          startedAt: p.startedAt,
          finishedAt: p.finishedAt,
          createdAt: new Date().toISOString(),
        } as WorkflowNodeRun);

    const nodeRuns = existing
      ? details.nodeRuns.map((x) => (x.nodeId === p.nodeId ? merged : x))
      : [...details.nodeRuns, merged];

    ctx.patchState({
      runDetailsById: {
        ...s.runDetailsById,
        [p.runId]: { ...details, nodeRuns },
      },
    });
  }

  @Action(ApplyWorkflowArtifactCreatedFromSse)
  applyWorkflowArtifactCreatedFromSse(
    ctx: StateContext<WorkflowsStateModel>,
    action: ApplyWorkflowArtifactCreatedFromSse,
  ) {
    const s = ctx.getState();
    const p = action.payload;

    const details = s.runDetailsById[p.runId];
    if (!details) return;

    const already = details.artifacts.some((a) => a.id === p.artifactId);
    if (already) return;

    const artifact: Artifact = {
      id: p.artifactId,
      workflowRunId: p.runId,
      nodeRunId: null,
      kind: p.kind,
      mimeType: p.mimeType ?? null,
      filename: p.filename ?? null,
      contentText: null,
      contentJson: null,
      blobPath: null,
      createdAt: new Date().toISOString(),
    };

    ctx.patchState({
      runDetailsById: {
        ...s.runDetailsById,
        [p.runId]: { ...details, artifacts: [...details.artifacts, artifact] },
      },
    });
  }

  // --------------------
  // Helpers
  // --------------------

  private upsertListById<T extends { id: string }>(list: T[], item: T): T[] {
    const idx = list.findIndex((x) => x.id === item.id);
    if (idx === -1) return [item, ...list];
    const copy = list.slice();
    copy[idx] = item;
    return copy;
  }

  private toErrorMessage(err: any): string {
    const msg =
      err?.error?.message ??
      err?.message ??
      (typeof err === 'string' ? err : null) ??
      'Unknown error';
    return String(msg);
  }
}
