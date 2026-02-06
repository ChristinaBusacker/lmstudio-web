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
import { WorkflowsState } from '@frontend/src/app/core/state/workflows/workflow.state';
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
import {
  DiagramNodeData,
  MERGE_IN_PREFIX,
  MERGE_OUT_PORT,
  NODE_CONDITION,
  NODE_EXPORT,
  NODE_LLM,
  NODE_LOOP,
  NODE_MERGE,
  NODE_PREVIEW,
} from '../../workflow-diagram.adapter';
import { WorkflowEditorStateService } from '../../workflow-editor-state.service';
import type { WorkflowRunDetails } from '@frontend/src/app/core/state/workflows/workflow.models';

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
  readonly selectedRunDetails$ = this.store.select(WorkflowsState.selectedRunDetails);

  title = computed(() => this.node().data.label || this.node().id);
  nodeType = computed(() => this.node().data.nodeType);

  readonly isLlm = computed(() => this.nodeType() === NODE_LLM);
  readonly isMerge = computed(() => this.nodeType() === NODE_MERGE);
  readonly isExport = computed(() => this.nodeType() === NODE_EXPORT);
  readonly isPreview = computed(() => this.nodeType() === NODE_PREVIEW);

  readonly promptInput$ = new Subject<string>();

  readonly mergePorts = computed(() => {
    const n = this.node();
    const cnt = Math.max(1, Number(n.data.mergeInputCount ?? 1));
    return Array.from({ length: cnt }, (_, i) => `${MERGE_IN_PREFIX}${i + 1}`);
  });

  constructor() {
    this.promptInput$
      .pipe(debounceTime(1000), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        const n = this.node();
        this.editorState.requestSnapshot();
        this.editorState.markDirty();
        this.model.updateNodeData(n.id, { ...n.data, prompt: value });
      });
  }

  // ---- Merge port layout ----

  /**
   * Pixel offset from the top of the node for the first merge input port.
   * This needs to match your node header height.
   */
  mergePortTop(index: number): number {
    const base = 64; // header + some spacing
    const step = 34; // distance between ports
    return base + index * step;
  }

  mergeOutPortTop(): number {
    return 76; // aligns nicely with first/second ports visually
  }

  // ---- Editing ----

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
    const patch: Partial<DiagramNodeData> = { nodeType: value };

    if (value === NODE_MERGE) {
      patch.mergeSeparator = n.data.mergeSeparator ?? '\n\n';
      patch.mergeInputCount = n.data.mergeInputCount ?? 1;
    }

    if (value === NODE_EXPORT) {
      patch.exportFilename = n.data.exportFilename ?? 'export.txt';
    }

    if (value === NODE_PREVIEW) {
      patch.previewMaxLines = n.data.previewMaxLines ?? 10;
    }

    this.model.updateNodeData(n.id, { ...n.data, ...patch });
  }

  updateMergeSeparator(value: string) {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, mergeSeparator: value });
  }

  updateExportFilename(value: string) {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, exportFilename: value });
  }

  updatePreviewMaxLines(value: number) {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, previewMaxLines: value });
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
        data: { ...n.data, label: newId },
      },
    ]);
  }

  // ---- Merge port connection info ----

  getIncomingSourceForPort(targetPortId: string): string | null {
    const nodeId = this.node().id;
    const json = this.safeDiagramJson();
    const edges: any[] = Array.isArray(json.edges) ? json.edges : [];

    const hit = edges.find(
      (e) =>
        String(e?.target ?? '') === nodeId && String(e?.targetPort ?? '') === String(targetPortId),
    );

    const src = hit?.source ? String(hit.source) : '';
    return src.trim() ? src : null;
  }

  getPortIndexLabel(portId: string): string {
    const m = /^in-(\d+)$/.exec(String(portId));
    return m ? m[1] : '?';
  }

  // ---- Preview ----

  getPreviewSourceNodeId(): string | null {
    const n = this.node();
    const json = this.safeDiagramJson();
    const edges: any[] = Array.isArray(json.edges) ? json.edges : [];

    const incoming = edges.filter((e) => String(e?.target ?? '') === n.id);

    const scored = incoming
      .map((e) => {
        const targetPort = String(e?.targetPort ?? '');
        const m = /^in-(\d+)$/.exec(targetPort);
        const idx = m ? Number(m[1]) : 999999;
        return { source: String(e?.source ?? ''), idx };
      })
      .filter((x) => !!x.source)
      .sort((a, b) => a.idx - b.idx || a.source.localeCompare(b.source));

    return scored.length ? scored[0].source : null;
  }

  getPreviewText(details: WorkflowRunDetails | null): string {
    if (!details) return 'No run selected.';
    const src = this.getPreviewSourceNodeId();
    if (!src) return 'Connect an input to preview.';

    const nr = details.nodeRuns.find((r) => r.nodeId === src);
    if (!nr) return `No output for node "${src}" in selected run.`;

    const maxLines = Math.max(3, Math.min(50, Number(this.node().data.previewMaxLines ?? 10)));

    const base =
      nr.outputText && String(nr.outputText).trim().length
        ? String(nr.outputText)
        : nr.outputJson !== null && nr.outputJson !== undefined
          ? JSON.stringify(nr.outputJson, null, 2)
          : '';

    if (!base.trim()) return `Node "${src}" produced no output.`;

    const lines = base.split('\n');
    const slice = lines.slice(0, maxLines).join('\n');
    return lines.length > maxLines ? `${slice}\n…` : slice;
  }

  private safeDiagramJson(): { nodes?: unknown[]; edges?: unknown[] } {
    try {
      return JSON.parse(this.model.toJSON()) as { nodes?: unknown[]; edges?: unknown[] };
    } catch {
      return {};
    }
  }

  protected readonly NODE_LLM = NODE_LLM;
  protected readonly NODE_CONDITION = NODE_CONDITION;
  protected readonly NODE_LOOP = NODE_LOOP;
  protected readonly NODE_MERGE = NODE_MERGE;
  protected readonly NODE_EXPORT = NODE_EXPORT;
  protected readonly NODE_PREVIEW = NODE_PREVIEW;
  protected readonly MERGE_OUT_PORT = MERGE_OUT_PORT;
}
