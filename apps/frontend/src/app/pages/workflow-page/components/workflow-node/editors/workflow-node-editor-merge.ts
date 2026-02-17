import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nPipe } from '../../../../../core/i18n/i18n.pipe';
import type { DiagramNodeData } from '../../../workflow-diagram.adapter';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-workflow-node-editor-merge',
  standalone: true,
  imports: [FormsModule, I18nPipe, CommonModule],
  templateUrl: './workflow-node-editor-merge.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowNodeEditorMergeComponent {
  data = input.required<DiagramNodeData>();
  readonly mergeSeparatorChange = output<string>();
}
