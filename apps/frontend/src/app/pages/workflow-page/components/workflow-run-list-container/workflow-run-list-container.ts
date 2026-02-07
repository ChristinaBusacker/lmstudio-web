import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { WorkflowRunList } from '../workflow-run-list/workflow-run-list';
import { CommonModule } from '@angular/common';
import { WorkflowRunDetailsComponent } from '../workflow-run-details/workflow-run-details';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LoadWorkflowRuns,
  SetSelectedRun,
  LoadWorkflowRunDetails,
} from '@frontend/src/app/core/state/workflows/workflow.actions';
import {
  WorkflowRun,
  WorkflowRunDetails,
} from '@frontend/src/app/core/state/workflows/workflow.models';
import { WorkflowsState } from '@frontend/src/app/core/state/workflows/workflow.state';
import { Store } from '@ngxs/store';
import { combineLatest, distinctUntilChanged, filter, map, tap } from 'rxjs';

@Component({
  selector: 'app-workflow-run-list-container',
  imports: [CommonModule, WorkflowRunList, WorkflowRunDetailsComponent],
  templateUrl: './workflow-run-list-container.html',
  styleUrl: './workflow-run-list-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowRunListContainer {
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);

  vm: {
    runs: WorkflowRun[];
    selectedRunId: string | null;
    isLoading: boolean;
    details: WorkflowRunDetails | null;
  } = {
    runs: [],
    selectedRunId: null,
    isLoading: false,
    details: null,
  };

  private loadedForWorkflowId: string | null = null;

  constructor() {
    const selectedWorkflow$ = this.store.select(WorkflowsState.selectedWorkflow);
    const runs$ = this.store.select(WorkflowsState.runs);
    const selectedRun$ = this.store.select(WorkflowsState.selectedRun);
    const selectedRunDetails$ = this.store.select(WorkflowsState.selectedRunDetails);
    const loading$ = this.store.select(WorkflowsState.loading);

    // 1) ViewModel: purely derived, NO dispatch here.
    combineLatest([selectedWorkflow$, runs$, selectedRun$, selectedRunDetails$, loading$])
      .pipe(
        map(([wf, runs, selectedRun, details, loading]) => {
          const workflowId = wf?.id ?? null;
          const filtered = workflowId ? runs.filter((r) => r.workflowId === workflowId) : [];

          return {
            runs: filtered,
            selectedRunId: selectedRun?.id ?? null,
            isLoading: loading.runs,
            details,
          };
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((vm) => {
        this.vm = vm;
      });

    // 2) Initial load: only when workflowId changes.
    selectedWorkflow$
      .pipe(
        map((wf) => wf?.id ?? null),
        distinctUntilChanged(),
        filter((id): id is string => !!id),
        tap((workflowId) => {
          if (this.loadedForWorkflowId === workflowId) return;
          this.loadedForWorkflowId = workflowId;
          this.store.dispatch(new LoadWorkflowRuns({ workflowId, limit: 50 }));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  onSelectRun(runId: string) {
    this.store.dispatch([new SetSelectedRun(runId), new LoadWorkflowRunDetails(runId)]);
  }

  onRefresh() {
    const wf = this.store.selectSnapshot(WorkflowsState.selectedWorkflow);
    if (!wf) return;

    this.store.dispatch(new LoadWorkflowRuns({ workflowId: wf.id, limit: 50 }));
  }
}
