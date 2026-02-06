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
