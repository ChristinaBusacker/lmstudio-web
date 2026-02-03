import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  NgDiagramModelService,
  NgDiagramNodeResizeAdornmentComponent,
  NgDiagramNodeRotateAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  NgDiagramPortComponent,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import { DiagramNodeData } from '../../workflow-diagram.adapter';

@Component({
  selector: 'app-workflow-node',
  standalone: true,
  imports: [
    CommonModule,
    NgDiagramPortComponent,
    NgDiagramNodeResizeAdornmentComponent,
    NgDiagramNodeRotateAdornmentComponent,
  ],
  hostDirectives: [{ directive: NgDiagramNodeSelectedDirective, inputs: ['node'] }],
  templateUrl: './workflow-node.html',
  styleUrls: ['./workflow-node.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowNodeComponent implements NgDiagramNodeTemplate<DiagramNodeData> {
  private readonly model = inject(NgDiagramModelService);

  node = input.required<Node<DiagramNodeData>>();

  title = computed(() => this.node().data.label || this.node().id);

  updateProfileName(value: string) {
    const n = this.node();
    this.model.updateNodeData(n.id, { ...n.data, profileName: value });
  }

  updatePrompt(value: string) {
    const n = this.node();
    this.model.updateNodeData(n.id, { ...n.data, prompt: value });
  }

  updateNodeType(value: string) {
    const n = this.node();
    this.model.updateNodeData(n.id, { ...n.data, nodeType: value });
  }
}
