import { CommonModule, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TabsModule } from '@frontend/src/app/ui/tabs/tabs-module';
import type { WorkflowRun } from '../../../../core/state/workflows/workflow.models';
import { Icon } from '../../../../ui/icon/icon';

type RunStatus = WorkflowRun['status'];
type RunVm = {
  id: string;
  workflowId: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  progress: number | null;
  isActive: boolean;
};
@Component({
  selector: 'app-workflow-run-list',
  standalone: true,
  imports: [CommonModule, DatePipe, Icon, TabsModule],
  templateUrl: './workflow-run-list.html',
  styleUrls: ['./workflow-run-list.scss'],
})
export class WorkflowRunList {
  @Input({ required: true }) runs: RunVm[] = [];
  @Input({ required: true }) selectedRunId: string | null = null;
  @Input({ required: true }) isLoading = false;

  @Output() selectRun = new EventEmitter<string>();
  @Output() refresh = new EventEmitter<void>();

  trackById = (_: number, r: RunVm) => r.id;

  percent(value: number): number {
    const v = Number(value);
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  statusLabel(s: RunStatus): string {
    switch (s) {
      case 'queued':
        return 'Queued';
      case 'running':
        return 'Running';
      case 'paused':
        return 'Paused';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'canceled':
        return 'Canceled';
      default:
        return String(s);
    }
  }

  statusIcon(s: RunStatus): string {
    switch (s) {
      case 'queued':
        return 'time-line';
      case 'running':
        return 'loader-4-line';
      case 'paused':
        return 'pause-circle-line';
      case 'completed':
        return 'checkbox-circle-line';
      case 'failed':
        return 'close-circle-line';
      case 'canceled':
        return 'forbid-line';
      default:
        return 'question-line';
    }
  }

  statusClass(s: RunStatus): string {
    return `status status--${s}`;
  }
}
