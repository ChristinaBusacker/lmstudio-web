import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Artifact,
  WorkflowRunDetails,
} from '@frontend/src/app/core/state/workflows/workflow.models';
import { Icon } from '@frontend/src/app/ui/icon/icon';

@Component({
  selector: 'app-workflow-run-details',
  standalone: true,
  imports: [CommonModule, Icon],
  templateUrl: './workflow-run-details.html',
  styleUrl: './workflow-run-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowRunDetailsComponent {
  @Input({ required: true }) details: WorkflowRunDetails | null = null;

  downloadUrl(a: Artifact): string {
    return `/api/workflows/artifacts/${encodeURIComponent(a.id)}/download`;
  }

  filename(a: Artifact): string {
    if (a.filename && a.filename.trim()) return a.filename;
    return `${a.kind}-${a.id}`;
  }

  badge(a: Artifact): string {
    const mime = (a.mimeType ?? '').split(';')[0].trim();
    return mime || a.kind;
  }

  shortPreview(a: Artifact): string {
    if (a.kind === 'json' && a.contentJson != null) {
      const s = JSON.stringify(a.contentJson);
      return s.length > 140 ? `${s.slice(0, 140)}…` : s;
    }
    const t = a.contentText ?? '';
    const oneLine = t.replace(/\s+/g, ' ').trim();
    return oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine;
  }
}
