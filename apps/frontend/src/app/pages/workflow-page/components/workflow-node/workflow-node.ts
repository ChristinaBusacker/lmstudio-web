import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AssetsApi, type AssetDto } from '@frontend/src/app/core/api/assets.api';
import { SettingsState } from '@frontend/src/app/core/state/settings/settings.state';
import { RerunWorkflowFromNode } from '@frontend/src/app/core/state/workflows/workflow.actions';
import type { WorkflowRunDetails } from '@frontend/src/app/core/state/workflows/workflow.models';
import { WorkflowsState } from '@frontend/src/app/core/state/workflows/workflow.state';
import { shortId } from '@frontend/src/app/core/utils/shortId.util';
import { Icon } from '@frontend/src/app/ui/icon/icon';
import { Store } from '@ngxs/store';
import {
  NgDiagramModelService,
  NgDiagramNodeResizeAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  NgDiagramSelectionService,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import { Subject, debounceTime, distinctUntilChanged, firstValueFrom, map } from 'rxjs';
import type { SettingsProfile } from '@shared/contracts';
import {
  DiagramNodeData,
  NODE_ASSET,
  NODE_CONDITION,
  NODE_EXPORT,
  NODE_LLM,
  NODE_LOOP_END,
  NODE_LOOP_START,
  NODE_MERGE,
  NODE_PREVIEW,
  NODE_TOOL,
  DEFAULT_SOURCE_PORT,
  DEFAULT_TARGET_PORT,
  CONDITION_TRUE_PORT,
  MERGE_OUT_PORT,
} from '../../workflow-diagram.adapter';
import { WorkflowEditorStateService } from '../../workflow-editor-state.service';
import { I18nPipe } from '../../../../core/i18n/i18n.pipe';
import { WorkflowNodePortsComponent } from './ports/workflow-node-ports';
import { WorkflowNodeEditorAssetComponent } from './editors/workflow-node-editor-asset';
import { WorkflowNodeEditorExportComponent } from './editors/workflow-node-editor-export';
import { WorkflowNodeEditorLlmComponent } from './editors/workflow-node-editor-llm';
import {
  WorkflowNodeEditorLoopStartComponent,
  type LoopMode,
} from './editors/workflow-node-editor-loop-start';
import { WorkflowNodeEditorMergeComponent } from './editors/workflow-node-editor-merge';
import { WorkflowNodeEditorPreviewComponent } from './editors/workflow-node-editor-preview';
import { WorkflowNodeEditorToolComponent } from './editors/workflow-node-editor-tool';

type DiagramEdge = {
  source?: unknown;
  target?: unknown;
  targetPort?: unknown;
};

function isDiagramEdge(v: unknown): v is DiagramEdge {
  return typeof v === 'object' && v !== null;
}

@Component({
  selector: 'app-workflow-node',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NgDiagramNodeResizeAdornmentComponent,
    Icon,
    I18nPipe,
    WorkflowNodePortsComponent,
    WorkflowNodeEditorLlmComponent,
    WorkflowNodeEditorAssetComponent,
    WorkflowNodeEditorMergeComponent,
    WorkflowNodeEditorExportComponent,
    WorkflowNodeEditorPreviewComponent,
    WorkflowNodeEditorToolComponent,
    WorkflowNodeEditorLoopStartComponent,
  ],
  hostDirectives: [{ directive: NgDiagramNodeSelectedDirective, inputs: ['node'] }],
  templateUrl: './workflow-node.html',
  styleUrls: ['./workflow-node.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowNodeComponent implements NgDiagramNodeTemplate<DiagramNodeData> {
  private readonly model = inject(NgDiagramModelService);
  private readonly store = inject(Store);
  private readonly assetsApi = inject(AssetsApi);
  private readonly editorState = inject(WorkflowEditorStateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly selection = inject(NgDiagramSelectionService);

  node = input.required<Node<DiagramNodeData>>();

  private readonly profiles$ = this.store.select(SettingsState.profiles);
  private readonly profileNamesSig = toSignal(
    this.profiles$.pipe(map((profiles: SettingsProfile[]) => profiles.map((p) => p.name))),
    { initialValue: [] as string[] },
  );

  readonly selectedRunDetails$ = this.store.select(WorkflowsState.selectedRunDetails);

  readonly title = computed(() => this.node().data.label || this.node().id);
  readonly nodeType = computed(() => this.node().data.nodeType);

  readonly nodeClasses = computed<Record<string, boolean>>(() => {
    const t = String(this.nodeType() ?? '').trim();
    return {
      node: true,
      preview: t === NODE_PREVIEW,
      loop: t === NODE_LOOP_START || t === NODE_LOOP_END,
      [t]: Boolean(t), // requested: keep selected nodeType as a CSS class
    };
  });

  readonly promptInput$ = new Subject<string>();

  constructor() {
    this.promptInput$
      .pipe(debounceTime(1000), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.patchNodeData({ prompt: value }));
  }

  // ---- Actions ----

  canRerunFromHere(): boolean {
    const run = this.store.selectSnapshot(WorkflowsState.selectedRun);
    if (!run) return false;
    return run.status !== 'queued' && run.status !== 'running' && run.status !== 'paused';
  }

  rerunFromHere(): void {
    const run = this.store.selectSnapshot(WorkflowsState.selectedRun);
    const node = this.node();
    if (!run || !node?.id) return;
    this.store.dispatch(new RerunWorkflowFromNode(run.id, node.id));
  }

  deleteNode(): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.deleteNodes([n.id]);
  }

  duplicateNode(): void {
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

  addLinkedNode(): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();

    const newId = shortId();
    const x = Number(n.position?.x ?? 0) + 360;
    const y = Number(n.position?.y ?? 0);

    this.model.addNodes([
      {
        id: newId,
        type: 'workflowNode',
        position: { x, y },
        data: {
          label: newId,
          nodeType: NODE_LLM,
          profileName: 'Default',
          prompt: '',
        },
      },
    ]);

    const sourcePort =
      n.data.nodeType === NODE_CONDITION
        ? CONDITION_TRUE_PORT
        : n.data.nodeType === NODE_MERGE
          ? MERGE_OUT_PORT
          : DEFAULT_SOURCE_PORT;

    this.model.addEdges([
      {
        id: `${n.id}->${newId}-${shortId()}`,
        source: n.id,
        target: newId,
        sourcePort,
        targetPort: DEFAULT_TARGET_PORT,
        data: {},
      },
    ]);
  }

  onNodePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (!e.shiftKey) return;

    e.preventDefault();
    e.stopPropagation();

    const id = this.node().id;
    const cur = this.selection.selection();
    const nodes = cur.nodes.map((n) => n.id);
    this.selection.select([...nodes, id]);
  }

  // ---- Data patching ----

  patchNodeData(patch: Partial<DiagramNodeData>): void {
    const n = this.node();
    if (!n?.id) return;

    this.editorState.requestSnapshot();
    this.editorState.markDirty();

    this.model.updateNodeData(n.id, { ...n.data, ...patch });
  }

  updateNodeType(value: string): void {
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

    if (value === NODE_LOOP_START) {
      patch.loopMode = (n.data.loopMode as LoopMode | undefined) ?? 'until';
      patch.loopConditionPrompt = n.data.loopConditionPrompt ?? 'Are we done?';
      patch.loopJoiner = n.data.loopJoiner ?? '\n\n';
      patch.loopMaxIterations = n.data.loopMaxIterations ?? 10;
      patch.loopCount = n.data.loopCount ?? 3;
    }

    if (value === NODE_ASSET) {
      patch.assetId = n.data.assetId ?? '';
      patch.assetFilename = n.data.assetFilename ?? '';
      patch.assetMimeType = n.data.assetMimeType ?? null;
      patch.assetSha256 = n.data.assetSha256 ?? '';
      patch.assetExtract = true;
    }

    this.patchNodeData(patch);
  }

  async uploadAsset(file: File): Promise<void> {
    const dto: AssetDto = await firstValueFrom(this.assetsApi.upload(file));
    this.patchNodeData({
      assetId: dto.id,
      assetFilename: dto.originalFilename,
      assetMimeType: dto.mimeType,
      assetSha256: dto.sha256,
    });
  }

  // ---- Preview ----

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

  private getPreviewSourceNodeId(): string | null {
    const n = this.node();
    const edges = this.safeEdges();
    const incoming = edges.filter((e) => String(e.target ?? '') === n.id);

    const scored = incoming
      .map((e) => {
        const targetPort = String(e.targetPort ?? '');
        const m = /^in-(\d+)$/.exec(targetPort);
        const idx = m ? Number(m[1]) : 999999;
        return { source: String(e.source ?? ''), idx };
      })
      .filter((x) => Boolean(x.source))
      .sort((a, b) => a.idx - b.idx || a.source.localeCompare(b.source));

    return scored.length ? scored[0].source : null;
  }

  private safeEdges(): DiagramEdge[] {
    try {
      const json = JSON.parse(this.model.toJSON()) as { edges?: unknown[] };
      const edges = Array.isArray(json.edges) ? json.edges : [];
      return edges.filter(isDiagramEdge);
    } catch {
      return [];
    }
  }

  // ---- Labels ----

  nodeTypeLabel(type: string): string {
    switch (type) {
      case NODE_LLM:
        return 'workflow.nodeType.llm';
      case NODE_ASSET:
        return 'workflow.nodeType.asset';
      case NODE_MERGE:
        return 'workflow.nodeType.merge';
      case NODE_EXPORT:
        return 'workflow.nodeType.export';
      case NODE_PREVIEW:
        return 'workflow.nodeType.preview';
      case NODE_CONDITION:
        return 'workflow.nodeType.condition';
      case NODE_LOOP_START:
        return 'workflow.nodeType.loopStart';
      case NODE_LOOP_END:
        return 'workflow.nodeType.loopEnd';
      case NODE_TOOL:
        return 'workflow.nodeType.tool';
      default:
        return type;
    }
  }

  protected readonly NODE_LLM = NODE_LLM;
  protected readonly NODE_ASSET = NODE_ASSET;
  protected readonly NODE_MERGE = NODE_MERGE;
  protected readonly NODE_EXPORT = NODE_EXPORT;
  protected readonly NODE_PREVIEW = NODE_PREVIEW;
  protected readonly NODE_TOOL = NODE_TOOL;
  protected readonly NODE_CONDITION = NODE_CONDITION;
  protected readonly NODE_LOOP_START = NODE_LOOP_START;
  protected readonly NODE_LOOP_END = NODE_LOOP_END;

  protected profileNames(): string[] {
    return this.profileNamesSig();
  }
}
