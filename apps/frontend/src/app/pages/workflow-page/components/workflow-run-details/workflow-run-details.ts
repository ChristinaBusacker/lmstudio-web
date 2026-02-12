/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, inject, ChangeDetectionStrategy } from '@angular/core';
import {
  CancelWorkflowRun,
  PauseWorkflowRun,
  ResumeWorkflowRun,
} from '@frontend/src/app/core/state/workflows/workflow.actions';
import type {
  Artifact,
  WorkflowNodeRun,
  WorkflowRunDetails,
} from '@frontend/src/app/core/state/workflows/workflow.models';
import { Icon } from '@frontend/src/app/ui/icon/icon';
import { Store } from '@ngxs/store';

@Component({
  selector: 'app-workflow-run-details',
  standalone: true,
  imports: [CommonModule, Icon],
  templateUrl: './workflow-run-details.html',
  styleUrl: './workflow-run-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowRunDetailsComponent implements OnChanges {
  private readonly store = inject(Store);

  @Input({ required: true }) details: WorkflowRunDetails | null = null;

  exports: any[] = [];

  ngOnChanges(): void {
    if (this.details) {
      this.exports = [...this.details.nodeRuns]
        .filter((nr) => this.isExporterNodeRun(nr))
        .map((nr) => this.details?.artifacts.find((a) => a.id === nr.primaryArtifactId));
    }
  }

  canPause(): boolean {
    const st = this.details?.run?.status;
    return st === 'running' || st === 'queued';
  }

  canResume(): boolean {
    return this.details?.run?.status === 'paused';
  }

  canCancel(): boolean {
    const st = this.details?.run?.status;
    return !!st && st !== 'completed' && st !== 'failed' && st !== 'canceled';
  }

  pause(): void {
    const runId = this.details?.run?.id;
    if (!runId) return;
    this.store.dispatch(new PauseWorkflowRun(runId));
  }

  resume(): void {
    const runId = this.details?.run?.id;
    if (!runId) return;
    this.store.dispatch(new ResumeWorkflowRun(runId));
  }

  cancel(): void {
    const runId = this.details?.run?.id;
    if (!runId) return;
    this.store.dispatch(new CancelWorkflowRun(runId));
  }

  exportArtifacts(details: WorkflowRunDetails | null): Artifact[] {
    if (!details) return [];

    const exporterNodeRunIds = new Set(
      (details.nodeRuns ?? []).filter((nr) => this.isExporterNodeRun(nr)).map((nr) => nr.id),
    );

    return (details.artifacts ?? []).filter(
      (a) => !!a.nodeRunId && exporterNodeRunIds.has(a.nodeRunId),
    );
  }

  downloadUrl(a: Artifact): string {
    return `/api/workflows/artifacts/${encodeURIComponent(a.id)}/download`;
  }

  filename(a: Artifact): string {
    if (a.filename && a.filename.trim()) return a.filename;
    return `export-${a.id}.txt`;
  }

  badge(a: Artifact): string {
    const mime = (a.mimeType ?? '').split(';')[0].trim();
    return mime || a.kind;
  }

  shortPreview(a: Artifact): string {
    const t = a.contentText ?? '';
    const oneLine = t.replace(/\s+/g, ' ').trim();
    return oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine;
  }

  private isExporterNodeRun(nr: WorkflowNodeRun): boolean {
    const inputSnapshot = nr.inputSnapshot as any;
    if (!inputSnapshot) {
      return false;
    }
    const note = inputSnapshot.note;
    return String(note ?? '') === 'workflow.export';
  }
}
