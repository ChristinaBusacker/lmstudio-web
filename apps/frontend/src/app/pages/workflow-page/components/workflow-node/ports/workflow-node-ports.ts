import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgDiagramPortComponent } from 'ng-diagram';
import {
  CONDITION_FALSE_PORT,
  CONDITION_TRUE_PORT,
  MERGE_IN_PREFIX,
  MERGE_OUT_PORT,
  NODE_CONDITION,
  NODE_EXPORT,
  NODE_LOOP_END,
  NODE_LOOP_START,
  NODE_MERGE,
  NODE_PREVIEW,
} from '../../../workflow-diagram.adapter';
import { I18nPipe } from '../../../../../core/i18n/i18n.pipe';

@Component({
  selector: 'app-workflow-node-ports',
  standalone: true,
  imports: [NgDiagramPortComponent, I18nPipe],
  templateUrl: './workflow-node-ports.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowNodePortsComponent {
  nodeId = input.required<string>();
  nodeType = input.required<string>();
  mergeInputCount = input<number>(1);

  readonly isMerge = computed(() => this.nodeType() === NODE_MERGE);
  readonly isCondition = computed(() => this.nodeType() === NODE_CONDITION);
  readonly isPreviewOrExport = computed(() => {
    const t = this.nodeType();
    return t === NODE_EXPORT || t === NODE_PREVIEW;
  });
  readonly isLoop = computed(() => {
    const t = this.nodeType();
    return t === NODE_LOOP_START || t === NODE_LOOP_END;
  });

  readonly mergePorts = computed(() => {
    const cnt = Math.max(1, Number(this.mergeInputCount() ?? 1));
    return Array.from({ length: cnt }, (_, i) => `${MERGE_IN_PREFIX}${i + 1}`);
  });

  // Pixel offset from the top of the node for the first merge input port.
  // Needs to match the node header height.
  mergePortTop(index: number): number {
    const base = 64;
    const step = 34;
    return base + index * step;
  }

  mergeOutPortTop(): number {
    return 76;
  }

  conditionTruePortTop(): number {
    return 72;
  }

  conditionFalsePortTop(): number {
    return 108;
  }

  getPortIndexLabel(portId: string): string {
    const m = /^in-(\d+)$/.exec(String(portId));
    return m ? m[1] : '?';
  }

  protected readonly MERGE_OUT_PORT = MERGE_OUT_PORT;
  protected readonly CONDITION_TRUE_PORT = CONDITION_TRUE_PORT;
  protected readonly CONDITION_FALSE_PORT = CONDITION_FALSE_PORT;
}
