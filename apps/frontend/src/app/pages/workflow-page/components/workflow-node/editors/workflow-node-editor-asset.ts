import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { I18nPipe } from '../../../../../core/i18n/i18n.pipe';
import type { DiagramNodeData } from '../../../workflow-diagram.adapter';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-workflow-node-editor-asset',
  standalone: true,
  imports: [I18nPipe, CommonModule],
  templateUrl: './workflow-node-editor-asset.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowNodeEditorAssetComponent {
  data = input.required<DiagramNodeData>();
  readonly fileSelected = output<File>();

  onFileSelected(evt: Event): void {
    const inputEl = evt.target instanceof HTMLInputElement ? evt.target : null;
    const file = inputEl?.files?.[0];
    if (!file) return;
    this.fileSelected.emit(file);
    // Reset so selecting the same file again still triggers change.
    inputEl.value = '';
  }
}
