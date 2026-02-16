/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { RerunWorkflowFromNode } from '@frontend/src/app/core/state/workflows/workflow.actions';
import type { WorkflowRunDetails } from '@frontend/src/app/core/state/workflows/workflow.models';
import { WorkflowsState } from '@frontend/src/app/core/state/workflows/workflow.state';
import { shortId } from '@frontend/src/app/core/utils/shortId.util';
import { Icon } from '@frontend/src/app/ui/icon/icon';
import { Store } from '@ngxs/store';
import { AssetsApi, type AssetDto } from '@frontend/src/app/core/api/assets.api';
import {
  NgDiagramModelService,
  NgDiagramNodeResizeAdornmentComponent,
  NgDiagramNodeSelectedDirective,
  NgDiagramPortComponent,
  NgDiagramSelectionService,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import { Subject, debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';
import {
  CONDITION_FALSE_PORT,
  CONDITION_TRUE_PORT,
  DEFAULT_SOURCE_PORT,
  DEFAULT_TARGET_PORT,
  DiagramNodeData,
  MERGE_IN_PREFIX,
  MERGE_OUT_PORT,
  NODE_ASSET,
  NODE_CONDITION,
  NODE_EXPORT,
  NODE_LLM,
  NODE_LOOP,
  NODE_LOOP_END,
  NODE_LOOP_START,
  NODE_MERGE,
  NODE_PREVIEW,
} from '../../workflow-diagram.adapter';
import { WorkflowEditorStateService } from '../../workflow-editor-state.service';
import { I18nPipe } from '../../../../core/i18n/i18n.pipe';

@Component({
  selector: 'app-workflow-node',
  standalone: true,
  imports: [CommonModule, FormsModule, NgDiagramPortComponent, NgDiagramNodeResizeAdornmentComponent, Icon, I18nPipe],
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

  readonly profiles$ = this.store.select(SettingsState.profiles);
  readonly selectedRunDetails$ = this.store.select(WorkflowsState.selectedRunDetails);

  canRerunFromHere(): boolean {
    const run = this.store.selectSnapshot(WorkflowsState.selectedRun);
    if (!run) return false;
    // Rerun-from invalidates downstream nodes and sets the run back to queued.
    // To avoid mid-flight surprises, we only allow this when the run is not active.
    return run.status !== 'queued' && run.status !== 'running' && run.status !== 'paused';
  }

  rerunFromHere(): void {
    const run = this.store.selectSnapshot(WorkflowsState.selectedRun);
    const node = this.node();
    if (!run || !node?.id) return;
    this.store.dispatch(new RerunWorkflowFromNode(run.id, node.id));
  }

  title = computed(() => this.node().data.label || this.node().id);
  nodeType = computed(() => this.node().data.nodeType);

  readonly isLlm = computed(() => this.nodeType() === NODE_LLM);
  readonly isAsset = computed(() => this.nodeType() === NODE_ASSET);
  readonly isCondition = computed(() => this.nodeType() === NODE_CONDITION);
  readonly isMerge = computed(() => this.nodeType() === NODE_MERGE);
  readonly isExport = computed(() => this.nodeType() === NODE_EXPORT);
  readonly isPreview = computed(() => this.nodeType() === NODE_PREVIEW);
  readonly isLoopStart = computed(() => this.nodeType() === NODE_LOOP_START);
  readonly isLoopEnd = computed(() => this.nodeType() === NODE_LOOP_END);

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

  // ---- Condition ports ----

  conditionTruePortTop(): number {
    return 72;
  }

  conditionFalsePortTop(): number {
    return 108;
  }

  // ---- Editing ----

  updateProfileName(value: string): void {
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    const n = this.node();
    this.model.updateNodeData(n.id, { ...n.data, profileName: value });
  }

  updateNodeType(value: string): void {
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

    if (value === NODE_LOOP_START) {
      patch.loopMode = n.data.loopMode ?? 'until';
      patch.loopConditionPrompt = n.data.loopConditionPrompt ?? 'Are we done?';
      patch.loopJoiner = n.data.loopJoiner ?? '\n\n';
      patch.loopMaxIterations = n.data.loopMaxIterations ?? 10;
    }

    if (value === NODE_ASSET) {
      patch.assetId = n.data.assetId ?? '';
      patch.assetFilename = n.data.assetFilename ?? '';
      patch.assetMimeType = n.data.assetMimeType ?? null;
      patch.assetSha256 = n.data.assetSha256 ?? '';
      patch.assetExtract = n.data.assetExtract ?? false;
    }

    this.model.updateNodeData(n.id, { ...n.data, ...patch });
  }

  async uploadAsset(file: File): Promise<void> {
    this.editorState.requestSnapshot();
    this.editorState.markDirty();

    const dto: AssetDto = await firstValueFrom(this.assetsApi.upload(file));
    const n = this.node();
    this.model.updateNodeData(n.id, {
      ...n.data,
      assetId: dto.id,
      assetFilename: dto.originalFilename,
      assetMimeType: dto.mimeType,
      assetSha256: dto.sha256,
    });
  }

  async onAssetFileSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.uploadAsset(file);
    // Reset so selecting the same file again still triggers change.
    input.value = '';
  }

  updateAssetExtract(value: boolean): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, assetExtract: value });
  }

  updateMergeSeparator(value: string): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, mergeSeparator: value });
  }

  updateExportFilename(value: string): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, exportFilename: value });
  }

  updatePreviewMaxLines(value: number): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, previewMaxLines: value });
  }

  updateLoopMode(value: 'while' | 'until'): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, loopMode: value });
  }

  updateLoopConditionPrompt(value: string): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, loopConditionPrompt: value });
  }

  updateLoopJoiner(value: string): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, loopJoiner: value });
  }

  updateLoopMaxIterations(value: number): void {
    const n = this.node();
    const v = Math.max(1, Math.min(1000, Number(value)));
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, loopMaxIterations: v });
  }


  updateStructuredOutputEnabled(value: boolean): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, {
      ...n.data,
      structuredOutputEnabled: Boolean(value),
      structuredOutputSchema: n.data.structuredOutputSchema ?? '',
    });
  }

  updateStructuredOutputSchema(value: string): void {
    const n = this.node();
    this.editorState.requestSnapshot();
    this.editorState.markDirty();
    this.model.updateNodeData(n.id, { ...n.data, structuredOutputSchema: String(value) });
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

  addLinkedNode(): void {
    const n = this.node();

    this.editorState.requestSnapshot();
    this.editorState.markDirty();

    const newId = shortId();

    const x = Number(n.position?.x ?? 0) + 360;
    const y = Number(n.position?.y ?? 0) + 0;

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

    // Prefer "true" branch for condition nodes by default.
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

    // Prevent default single-select behavior
    e.preventDefault();
    e.stopPropagation();

    const id = this.node().id;

    const cur = this.selection.selection();
    const nodes = cur.nodes.map((n) => n.id);
    this.selection.select([...nodes, id]);
  }

  private safeDiagramJson(): { nodes?: unknown[]; edges?: unknown[] } {
    try {
      return JSON.parse(this.model.toJSON()) as { nodes?: unknown[]; edges?: unknown[] };
    } catch {
      return {};
    }
  }

  protected readonly NODE_LLM = NODE_LLM;
  protected readonly NODE_ASSET = NODE_ASSET;
  protected readonly NODE_CONDITION = NODE_CONDITION;
  protected readonly NODE_LOOP = NODE_LOOP;
  protected readonly NODE_LOOP_START = NODE_LOOP_START;
  protected readonly NODE_LOOP_END = NODE_LOOP_END;
  protected readonly NODE_MERGE = NODE_MERGE;
  protected readonly NODE_EXPORT = NODE_EXPORT;
  protected readonly NODE_PREVIEW = NODE_PREVIEW;
  protected readonly MERGE_OUT_PORT = MERGE_OUT_PORT;
  protected readonly CONDITION_TRUE_PORT = CONDITION_TRUE_PORT;
  protected readonly CONDITION_FALSE_PORT = CONDITION_FALSE_PORT;
  nodeTypeLabel(type: string): string {
    // Return i18n key for the given node type.
    switch (type) {
      case this.NODE_LLM:
        return 'workflow.nodeType.llm';
      case this.NODE_ASSET:
        return 'workflow.nodeType.asset';
      case this.NODE_MERGE:
        return 'workflow.nodeType.merge';
      case this.NODE_EXPORT:
        return 'workflow.nodeType.export';
      case this.NODE_PREVIEW:
        return 'workflow.nodeType.preview';
      case this.NODE_CONDITION:
        return 'workflow.nodeType.condition';
      case this.NODE_LOOP_START:
        return 'workflow.nodeType.loopStart';
      case this.NODE_LOOP_END:
        return 'workflow.nodeType.loopEnd';
      default:
        return type; // fallback
    }
  }

}