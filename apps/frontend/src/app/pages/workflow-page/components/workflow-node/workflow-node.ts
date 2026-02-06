/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SettingsState } from '@frontend/src/app/core/state/settings/settings.state';
import { shortId } from '@frontend/src/app/core/utils/shortId.util';
import { Icon } from '@frontend/src/app/ui/icon/icon';
import { Store } from '@ngxs/store';
import {
  NgDiagramModelService,
  NgDiagramNodeResizeAdornmentComponent,
  NgDiagramNodeRotateAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  NgDiagramPortComponent,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { DiagramNodeData } from '../../workflow-diagram.adapter';
import { WorkflowEditorStateService } from '../../workflow-editor-state.service';

@Component({
  selector: 'app-workflow-node',
  standalone: true,
  imports: [
    CommonModule,
    NgDiagramPortComponent,
    NgDiagramNodeResizeAdornmentComponent,
    NgDiagramNodeRotateAdornmentComponent,
    Icon,
  ],
  hostDirectives: [{ directive: NgDiagramNodeSelectedDirective, inputs: ['node'] }],
  templateUrl: './workflow-node.html',
  styleUrls: ['./workflow-node.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowNodeComponent implements NgDiagramNodeTemplate<DiagramNodeData> {
  private readonly model = inject(NgDiagramModelService);
  private readonly store = inject(Store);
  private readonly editorState = inject(WorkflowEditorStateService);
  private readonly destroyRef = inject(DestroyRef);

  node = input.required<Node<DiagramNodeData>>();

  readonly profiles$ = this.store.select(SettingsState.profiles);

  title = computed(() => this.node().data.label || this.node().id);

  /**
   * Options for the single input port. This returns all other node ids.
   * We intentionally keep this simple (v1): one input, one output.
   */
  upstreamNodeOptions = computed(() => {
    const selfId = this.node().id;
    const ids = this.model
      .nodes()
      .map((n) => n.id)
      .filter((id) => id && id !== selfId)
      .sort((a, b) => a.localeCompare(b));
    return ids;
  });

  readonly promptInput$ = new Subject<string>();

  constructor() {
    this.promptInput$
      .pipe(debounceTime(1000), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        const n = this.node();

        this.editorState.requestSnapshot();
        this.editorState.markDirty();

        this.model.updateNodeData(n.id, {
          ...n.data,
          prompt: value,
        });
      });
  }

  updateProfileName(value: string) {
    this.editorState.requestSnapshot();
    this.editorState.markDirty();

    const n = this.node();
    this.model.updateNodeData(n.id, { ...n.data, profileName: value });
  }

  updateNodeType(value: string) {
    this.editorState.requestSnapshot();
    this.editorState.markDirty();

    const n = this.node();
    this.model.updateNodeData(n.id, { ...n.data, nodeType: value });
  }

  updateInputFrom(value: string) {
    this.editorState.requestSnapshot();
    this.editorState.markDirty();

    const n = this.node();
    this.model.updateNodeData(n.id, { ...n.data, inputFrom: value });
  }

  deleteNode() {
    const n = this.node();

    this.editorState.requestSnapshot();
    this.editorState.markDirty();

    this.model.deleteNodes([n.id]);
  }

  duplicateNode() {
    const n = this.node();

    this.editorState.requestSnapshot();
    this.editorState.markDirty();

    const newId = shortId();

    const pos = n.position ?? { x: 60, y: 60 };
    const offset = 40;

    this.model.addNodes([
      {
        id: newId,
        type: n.type,
        position: { x: pos.x + offset, y: pos.y + offset },
        data: {
          ...n.data,
          label: newId,
        },
      },
    ]);
  }
}
