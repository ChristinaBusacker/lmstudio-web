/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngxs/store';
import { combineLatest, distinctUntilChanged, filter, map, tap } from 'rxjs';

import { WorkflowRunList } from '../workflow-run-list/workflow-run-list';
import { WorkflowRunDetailsComponent } from '../workflow-run-details/workflow-run-details';
import {
  LoadWorkflowRuns,
  SetSelectedRun,
  LoadWorkflowRunDetails,
} from '@frontend/src/app/core/state/workflows/workflow.actions';
import { WorkflowsState } from '@frontend/src/app/core/state/workflows/workflow.state';
import type {
  WorkflowRun,
  WorkflowRunDetails,
  WorkflowNodeRun,
} from '@frontend/src/app/core/state/workflows/workflow.models';
import { TabsModule } from '@frontend/src/app/ui/tabs/tabs-module';

type RunVm = WorkflowRun & {
  progress: number | null;
  isActive: boolean;
};

@Component({
  selector: 'app-workflow-run-list-container',
  imports: [CommonModule, WorkflowRunList, WorkflowRunDetailsComponent, TabsModule],
  templateUrl: './workflow-run-list-container.html',
  styleUrl: './workflow-run-list-container.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowRunListContainer {
  private readonly store = inject(Store);
  private readonly destroyRef;
  private cdr = inject(ChangeDetectorRef);

  vm: {
    runs: RunVm[];
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

    combineLatest([selectedWorkflow$, runs$, selectedRun$, selectedRunDetails$, loading$])
      .pipe(
        map(([wf, runs, selectedRun, details, loading]) => {
          const workflowId = wf?.id ?? null;
          const filtered = workflowId ? runs.filter((r) => r.workflowId === workflowId) : [];

          const totalExecutable = wf ? this.countExecutableNodes(wf.graph) : 0;

          const withProgress: RunVm[] = filtered.map((r) => {
            const isActive = r.status === 'running' || r.status === 'queued';

            let progress: number | null = null;
            if (details?.run?.id === r.id && totalExecutable > 0) {
              const done = this.countProcessedNodeRuns(details.nodeRuns ?? []);
              progress = Math.max(0, Math.min(1, done / totalExecutable));
            }

            return { ...r, isActive, progress };
          });

          return {
            runs: withProgress,
            selectedRunId: selectedRun?.id ?? null,
            isLoading: loading.runs,
            details,
          };
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((vm) => {
        this.vm = vm;
        this.cdr.detectChanges();
      });

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

  private countProcessedNodeRuns(nodeRuns: WorkflowNodeRun[]): number {
    return nodeRuns.filter((nr: any) => nr.status === 'completed' || nr.status === 'failed').length;
  }

  private countExecutableNodes(graph: any): number {
    const nodes: any[] = Array.isArray(graph?.nodes) ? graph.nodes : [];

    // Minimal rule-set: exclude preview nodes from "work"
    return nodes.filter((n) => {
      const t = String(n?.type ?? n?.nodeType ?? n?.data?.nodeType ?? '');
      if (t === 'ui.preview') return false;
      return true;
    }).length;
  }
}
