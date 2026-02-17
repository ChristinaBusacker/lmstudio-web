import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nPipe } from '../../../../../core/i18n/i18n.pipe';
import type { DiagramNodeData } from '../../../workflow-diagram.adapter';
import { CommonModule } from '@angular/common';

export type LoopMode = 'until' | 'while' | 'count';

@Component({
  selector: 'app-workflow-node-editor-loop-start',
  standalone: true,
  imports: [FormsModule, I18nPipe, CommonModule],
  templateUrl: './workflow-node-editor-loop-start.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowNodeEditorLoopStartComponent {
  data = input.required<DiagramNodeData>();
  profiles = input<string[]>([]);

  readonly profileNameChange = output<string>();
  readonly loopModeChange = output<LoopMode>();
  readonly loopMaxIterationsChange = output<number>();
  readonly loopCountChange = output<number>();
  readonly loopJoinerChange = output<string>();
  readonly loopConditionPromptChange = output<string>();
}
