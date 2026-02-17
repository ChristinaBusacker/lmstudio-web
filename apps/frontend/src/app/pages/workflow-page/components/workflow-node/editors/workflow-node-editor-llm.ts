import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nPipe } from '../../../../../core/i18n/i18n.pipe';
import type { DiagramNodeData } from '../../../workflow-diagram.adapter';
import { getEventTargetChecked } from '../utils/dom.util';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-workflow-node-editor-llm',
  standalone: true,
  imports: [FormsModule, I18nPipe, CommonModule],
  templateUrl: './workflow-node-editor-llm.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowNodeEditorLlmComponent {
  data = input.required<DiagramNodeData>();
  profiles = input<string[]>([]);
  showStructuredOutput = input<boolean>(true);

  readonly promptChange = output<string>();
  readonly profileNameChange = output<string>();
  readonly structuredOutputEnabledChange = output<boolean>();
  readonly structuredOutputSchemaChange = output<string>();

  readonly structuredEnabled = computed(() => Boolean(this.data().structuredOutputEnabled));

  onStructuredToggle(evt: Event): void {
    this.structuredOutputEnabledChange.emit(getEventTargetChecked(evt));
  }
}
