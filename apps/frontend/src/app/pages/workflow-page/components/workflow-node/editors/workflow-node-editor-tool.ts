import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nPipe } from '../../../../../core/i18n/i18n.pipe';
import type { DiagramNodeData } from '../../../workflow-diagram.adapter';
import { CommonModule } from '@angular/common';

type ToolName =
  | 'web_search'
  | 'web_read'
  | 'doc_read'
  | 'current_time'
  | 'resolve_relative_date'
  | 'date_math'
  | 'math'
  | 'json_validate'
  | 'json_repair';

@Component({
  selector: 'app-workflow-node-editor-tool',
  standalone: true,
  imports: [FormsModule, I18nPipe, CommonModule],
  templateUrl: './workflow-node-editor-tool.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowNodeEditorToolComponent {
  data = input.required<DiagramNodeData>();

  readonly toolNameChange = output<ToolName>();
  readonly fieldPatch = output<Partial<DiagramNodeData>>();

  readonly toolNames: ToolName[] = [
    'web_search',
    'web_read',
    'doc_read',
    'current_time',
    'resolve_relative_date',
    'date_math',
    'math',
    'json_validate',
    'json_repair',
  ];

  toNumber(value: unknown, fallback = 0): number {
    const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
    return Number.isFinite(n) ? n : fallback;
  }

  onToolNameChange(value: string): void {
    const v = this.toolNames.includes(value as ToolName) ? (value as ToolName) : 'web_search';
    this.toolNameChange.emit(v);
  }
}
