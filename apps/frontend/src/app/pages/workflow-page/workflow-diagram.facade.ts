/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Store } from '@ngxs/store';
import {
  NgDiagramModelService,
  type Edge,
  type Node,
  initializeModel,
  type EdgeDrawnEvent,
} from 'ng-diagram';

import { WorkflowsState } from '../../core/state/workflows/workflow.state';
import { UpdateWorkflow } from '../../core/state/workflows/workflow.actions';
import { shortId } from '../../core/utils/shortId.util';
import {
  WORKFLOW_NODE_TEMPLATE,
  diagramJsonToWorkflowGraph,
  normalizeWorkflowGraph,
  workflowToDiagramModel,
  type WorkflowGraph,
} from './workflow-diagram.adapter';
import { WorkflowEditorStateService } from './workflow-editor-state.service';

type DiagramNode = Node<object>;
type DiagramEdge = Edge<object>;
type DiagramModel = ReturnType<typeof initializeModel>;
type DiagramModelInput = Parameters<typeof initializeModel>[0];

type GraphSnapshot = { nodes: DiagramNode[]; edges: DiagramEdge[] };

const NODE_MERGE = 'workflow.merge';
const NODE_EXPORT = 'workflow.export';
const NODE_PREVIEW = 'ui.preview';

const MERGE_IN_PREFIX = 'in-';

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Facade for all diagram-related editor behavior:
 * - loading a workflow graph into ngDiagram
 * - tracking dirty state
 * - undo/redo history
 * - save/reset to last saved
 * - add node
 *
 * This service is intentionally UI-framework-ish (ngDiagram aware),
 * so the page component can stay thin.
 */
@Injectable()
export class WorkflowDiagramFacade {
  private readonly store = inject(Store);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly editorState = inject(WorkflowEditorStateService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _diagramReady = signal(false);
  readonly diagramReady = this._diagramReady.asReadonly();

  private readonly queuedOps: Array<() => void> = [];

  private undoStack: GraphSnapshot[] = [];
  private redoStack: GraphSnapshot[] = [];
  private lastSavedSnapshot: GraphSnapshot | null = null;

  private dataEditSnapshotTaken = false;
  private dataEditTimer: number | null = null;

  private lastLoadedGraphSig: string | null = null;
  private pointerDownSig: string | null = null;

  private lastLoadedWorkflowId: string | null = null;

  readonly dirty = this.editorState.dirty;

  readonly canUndo = computed(() => this.undoStack.length > 0);
  readonly canRedo = computed(() => this.redoStack.length > 0);
  readonly canReset = computed(() => !!this.lastSavedSnapshot);

  private currentModel: DiagramModel | null = null;

  constructor() {
    effect(() => {
      if (this.editorState.consumeSnapshotRequest()) {
        this.ensureDataEditSnapshot();
      }
    });
  }

  onDiagramInit(): void {
    this._diagramReady.set(true);

    this.lastSavedSnapshot = this.snapshot();
    this.undoStack = [];
    this.redoStack = [];

    for (const fn of this.queuedOps) fn();
    this.queuedOps.length = 0;
  }

  onPointerDownStartTracking(): void {
    this.runWhenReady(() => {
      this.pointerDownSig = this.diagramSig();
      this.pushHistorySnapshot();
    });
  }

  onPointerUpFinishTracking(): void {
    this.runWhenReady(() => {
      if (this.pointerDownSig === null) return;

      const after = this.diagramSig();
      if (after !== this.pointerDownSig) {
        this.editorState.markDirty();
      }
      this.pointerDownSig = null;
    });
  }

  /**
   * Keeps ports/edges consistent immediately after a user draws an edge.
   * - Merge: enforce deterministic `in-N` ports and grow mergeInputCount.
   * - Export/Preview: enforce exactly one incoming edge (replace behavior).
   */
  onEdgeDrawn(e: EdgeDrawnEvent): void {
    this.runWhenReady(() => {
      const targetNode = e.target as DiagramNode;
      const nodeType = String((targetNode as any)?.data?.nodeType ?? '');

      const edgeId = String((e.edge as any)?.id ?? '');
      if (!edgeId) return;

      // Single-input nodes: keep only the newest incoming connection.
      if (nodeType === NODE_EXPORT || nodeType === NODE_PREVIEW) {
        this.enforceSingleIncomingEdge(targetNode.id, edgeId);

        // Optional: make the port explicit/stable
        this.modelService.updateEdge(edgeId, { targetPort: 'port-left' });

        this.editorState.markDirty();
        return;
      }

      // Merge nodes: attach to a deterministic in-N port and keep one free port.
      if (nodeType === NODE_MERGE) {
        const currentTargetPort = (e.targetPort ? String(e.targetPort) : '').trim();
        const used = this.getUsedMergeInputIndices(targetNode.id);

        const targetPort = this.isMergeInPort(currentTargetPort)
          ? currentTargetPort
          : this.nextFreeMergePort(used);

        this.modelService.updateEdge(edgeId, { targetPort });

        const usedWithNew = [...used];
        const idx = this.mergeIndexFromPort(targetPort);
        if (idx) usedWithNew.push(idx);

        const maxUsed = this.maxMergeIndex(usedWithNew);
        const desiredCount = Math.max(1, maxUsed + 1);

        const dataAny = (targetNode as any).data ?? {};
        if (Number(dataAny.mergeInputCount ?? 1) !== desiredCount) {
          this.modelService.updateNodeData(targetNode.id, {
            ...dataAny,
            mergeInputCount: desiredCount,
          });
        }

        this.editorState.markDirty();
      }
    });
  }

  /**
   * Pure loading method: no effects, no reactive setup, no injections.
   * It only returns a model based on current state and input.
   */
  loadWorkflowGraph(workflow: { id?: string; graph?: unknown } | null): { model: DiagramModel } {
    if (!workflow) {
      this.resetEditorForEmpty();
      const m = initializeModel({ nodes: [], edges: [] });
      this.currentModel = m;
      return { model: m };
    }

    const incomingWorkflowId = workflow?.id ? String(workflow.id) : null;
    const workflowChanged =
      incomingWorkflowId !== null && incomingWorkflowId !== this.lastLoadedWorkflowId;

    const incomingSig = this.workflowGraphSig(workflow);

    if (!workflowChanged && this.dirty()) {
      this.lastLoadedWorkflowId = incomingWorkflowId;
      return { model: this.currentModel ?? initializeModel(this.currentDiagramModelData()) };
    }

    if (incomingSig === this.lastLoadedGraphSig) {
      this.lastLoadedWorkflowId = incomingWorkflowId;
      return { model: this.currentModel ?? initializeModel(this.currentDiagramModelData()) };
    }

    this.resetEditorForIncomingModel();

    const { nodes, edges } = workflowToDiagramModel(workflow as any);
    const model = initializeModel({
      nodes: nodes as DiagramNode[],
      edges: edges as DiagramEdge[],
    });

    this.currentModel = model;
    this.lastLoadedGraphSig = incomingSig;
    this.lastLoadedWorkflowId = incomingWorkflowId;
    return { model };
  }

  addNode(): void {
    this.runWhenReady(() => {
      this.pushHistorySnapshot();
      this.editorState.markDirty();

      const existingIds = this.modelService.nodes().map((n: DiagramNode) => n.id);
      const id = shortId();

      const x = 60 + existingIds.length * 40;
      const y = 60 + existingIds.length * 30;

      this.modelService.addNodes([
        {
          id,
          type: WORKFLOW_NODE_TEMPLATE,
          position: { x, y },
          data: {
            label: id,
            nodeType: 'lmstudio.llm',
            profileName: 'Default',
            prompt: '',
          },
        } as DiagramNode,
      ]);
    });
  }

  saveSelectedWorkflow(): void {
    // Fire-and-forget variant kept for existing callers.
    this.saveSelectedWorkflow$().subscribe();
  }

  /**
   * Saves the current diagram to the server and returns an Observable that completes
   * once the underlying NGXS dispatch completes.
   */
  saveSelectedWorkflow$(): Observable<unknown> {
    // If the diagram isn't ready yet, just no-op.
    if (!this._diagramReady()) return of(null);

    const wf = this.store.selectSnapshot(WorkflowsState.selectedWorkflow);
    if (!wf) return of(null);

    // Normalize before persisting:
    // - Single-input nodes must not have multiple incoming edges.
    // - Merge nodes keep their targetPort semantics.
    const normalizedModel = this.normalizeModelForSave();

    const graph = diagramJsonToWorkflowGraph(JSON.stringify(normalizedModel));
    this.lastLoadedGraphSig = this.workflowGraphSig({ graph });

    const dispatch$ = this.store.dispatch(new UpdateWorkflow(wf.id, { graph: graph as any }));

    // Optimistically update editor state immediately (UX), while the server saves.
    this.editorState.clearDirty();
    this.lastSavedSnapshot = this.snapshot();
    this.undoStack = [];
    this.redoStack = [];

    return dispatch$;
  }

  resetToLastSaved(): void {
    this.runWhenReady(() => {
      if (!this.lastSavedSnapshot) return;

      this.applySnapshot(this.lastSavedSnapshot);
      this.editorState.clearDirty();
      this.undoStack = [];
      this.redoStack = [];
    });
  }

  markDirty(): void {
    this.editorState.markDirty();
  }

  undo(): void {
    this.runWhenReady(() => {
      const prev = this.undoStack.pop();
      if (!prev) return;

      this.redoStack.push(this.snapshot());
      this.applySnapshot(prev);
      this.editorState.markDirty();
    });
  }

  redo(): void {
    this.runWhenReady(() => {
      const next = this.redoStack.pop();
      if (!next) return;

      this.undoStack.push(this.snapshot());
      this.applySnapshot(next);
      this.editorState.markDirty();
    });
  }

  ensureDataEditSnapshot(): void {
    if (this.dataEditSnapshotTaken) return;

    this.pushHistorySnapshot();
    this.dataEditSnapshotTaken = true;

    if (this.dataEditTimer !== null) window.clearTimeout(this.dataEditTimer);
    this.dataEditTimer = window.setTimeout(() => {
      this.dataEditSnapshotTaken = false;
      this.dataEditTimer = null;
    }, 800);

    this.destroyRef.onDestroy(() => {
      if (this.dataEditTimer !== null) window.clearTimeout(this.dataEditTimer);
    });
  }

  resetEditorForEmpty(): void {
    this._diagramReady.set(false);
    this.queuedOps.length = 0;

    this.undoStack = [];
    this.redoStack = [];
    this.lastSavedSnapshot = null;

    this.editorState.clearDirty();
    this.lastLoadedGraphSig = null;
  }

  resetEditorForIncomingModel(): void {
    this._diagramReady.set(false);
    this.queuedOps.length = 0;

    this.undoStack = [];
    this.redoStack = [];
    this.lastSavedSnapshot = null;

    this.editorState.clearDirty();
  }

  // ---------- internal helpers ----------

  private runWhenReady(fn: () => void): void {
    if (this._diagramReady()) {
      fn();
      return;
    }
    this.queuedOps.push(fn);
  }

  private currentDiagramModelData(): DiagramModelInput {
    const json = safeJsonParse<{ nodes?: DiagramNode[]; edges?: DiagramEdge[] }>(
      this.modelService.toJSON(),
      {},
    );

    return {
      nodes: Array.isArray(json.nodes) ? json.nodes : [],
      edges: Array.isArray(json.edges) ? json.edges : [],
    } as DiagramModelInput;
  }

  private snapshot(): GraphSnapshot {
    const json = safeJsonParse<{ nodes?: DiagramNode[]; edges?: DiagramEdge[] }>(
      this.modelService.toJSON(),
      {},
    );

    return structuredClone({
      nodes: Array.isArray(json.nodes) ? json.nodes : [],
      edges: Array.isArray(json.edges) ? json.edges : [],
    });
  }

  private pushHistorySnapshot(): void {
    this.undoStack.push(this.snapshot());
    this.redoStack = [];
  }

  private applySnapshot(snapshot: GraphSnapshot): void {
    const modelAny = this.modelService as any;

    if (typeof modelAny.edges === 'function' && typeof modelAny.deleteEdges === 'function') {
      const existingEdgeIds = (modelAny.edges() ?? []).map((e: any) => e.id);
      if (existingEdgeIds.length) modelAny.deleteEdges(existingEdgeIds);
    }

    const existingNodeIds = this.modelService.nodes().map((n: DiagramNode) => n.id);
    if (existingNodeIds.length) this.modelService.deleteNodes(existingNodeIds);

    if (snapshot.nodes.length) this.modelService.addNodes(snapshot.nodes);
    if (snapshot.edges.length) this.modelService.addEdges(snapshot.edges);
  }

  private diagramSig(): string {
    const json = safeJsonParse<{ nodes?: any[]; edges?: any[] }>(this.modelService.toJSON(), {});
    const nodes = Array.isArray(json.nodes) ? json.nodes : [];
    const edges = Array.isArray(json.edges) ? json.edges : [];

    return JSON.stringify({
      nodes: nodes.map((n: any) => ({
        id: n.id,
        position: n.position ?? null,
        type: n.type ?? null,
        data: {
          label: n.data?.label ?? null,
          nodeType: n.data?.nodeType ?? null,
          profileName: n.data?.profileName ?? null,
          prompt: n.data?.prompt ?? null,
          mergeInputCount: n.data?.mergeInputCount ?? null,
        },
      })),
      edges: edges.map((e: any) => ({
        id: e.id ?? null,
        source: e.source ?? null,
        target: e.target ?? null,
        sourcePort: e.sourcePort ?? null,
        targetPort: e.targetPort ?? null,
        type: e.type ?? null,
      })),
    });
  }

  private workflowGraphSig(wf: { graph?: unknown } | null): string {
    const g: WorkflowGraph = normalizeWorkflowGraph(wf?.graph ?? null);

    return JSON.stringify({
      nodes: g.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        profileName: n.profileName ?? '',
        prompt: n.prompt ?? '',
        position: n.position ?? null,
      })),
      edges: (g.edges ?? []).map((e) => ({
        source: e.source,
        target: e.target,
        sourcePort: e.sourcePort ?? null,
        targetPort: e.targetPort ?? null,
        type: e.type ?? null,
      })),
    });
  }

  private isMergeInPort(portId: string): boolean {
    return /^in-\d+$/.test(portId);
  }

  private mergeIndexFromPort(portId: string): number | null {
    const m = /^in-(\d+)$/.exec(portId);
    return m ? Number(m[1]) : null;
  }

  private maxMergeIndex(indices: number[]): number {
    return indices.length ? Math.max(...indices) : 0;
  }

  private getUsedMergeInputIndices(targetNodeId: string): number[] {
    const edges = (this.modelService as any).edges?.() as any[] | undefined;
    const list = Array.isArray(edges) ? edges : [];

    const indices: number[] = [];
    for (const e of list) {
      if (String(e?.target ?? '') !== targetNodeId) continue;
      const tp = String(e?.targetPort ?? '');
      const idx = this.mergeIndexFromPort(tp);
      if (idx) indices.push(idx);
    }
    return indices;
  }

  private nextFreeMergePort(usedIndices: number[]): string {
    const used = new Set(usedIndices);
    let i = 1;
    while (used.has(i)) i += 1;
    return `${MERGE_IN_PREFIX}${i}`;
  }

  /**
   * Ensures a node has at most one incoming edge by deleting all other incoming edges.
   * The edge with `keepEdgeId` is kept.
   */
  private enforceSingleIncomingEdge(targetNodeId: string, keepEdgeId: string): void {
    const modelAny = this.modelService as any;
    const edges = (modelAny.edges?.() ?? []) as any[];
    const incoming = edges.filter((ed) => String(ed?.target ?? '') === targetNodeId);

    if (incoming.length <= 1) return;

    const toDelete = incoming
      .filter((ed) => String(ed?.id ?? '') !== keepEdgeId)
      .map((ed) => String(ed.id))
      .filter((id) => id.length > 0);

    if (toDelete.length && typeof modelAny.deleteEdges === 'function') {
      modelAny.deleteEdges(toDelete);
    }
  }

  /**
   * Produces a save-safe model that removes hidden/duplicate incoming edges for
   * nodes that must be single-input (export/preview).
   */
  private normalizeModelForSave(): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
    const json = safeJsonParse<{ nodes?: any[]; edges?: any[] }>(this.modelService.toJSON(), {});
    const nodes = (Array.isArray(json.nodes) ? json.nodes : []) as DiagramNode[];
    const edges = (Array.isArray(json.edges) ? json.edges : []) as DiagramEdge[];

    const byId = new Map<string, DiagramNode>();
    for (const n of nodes) byId.set(String((n as any).id), n);

    const singleInputTargets = new Set<string>();
    for (const n of nodes) {
      const t = String(((n as any).data?.nodeType ?? '') as string);
      if (t === NODE_EXPORT || t === NODE_PREVIEW) {
        singleInputTargets.add(String((n as any).id));
      }
    }

    if (singleInputTargets.size === 0) return { nodes, edges };

    const keptEdges: DiagramEdge[] = [];
    const seenIncoming = new Map<string, boolean>();

    // Keep the *last* incoming edge per single-input node (user's latest action tends to be last in the array).
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i] as any;
      const target = String(e?.target ?? '');

      if (!singleInputTargets.has(target)) {
        keptEdges.push(edges[i]);
        continue;
      }

      // Mark as candidate; we will only keep the last one.
      seenIncoming.set(target, true);
    }

    if (seenIncoming.size === 0) return { nodes, edges };

    const lastIncomingIndex = new Map<string, number>();
    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i] as any;
      const target = String(e?.target ?? '');
      if (singleInputTargets.has(target)) lastIncomingIndex.set(target, i);
    }

    for (let i = 0; i < edges.length; i += 1) {
      const e = edges[i] as any;
      const target = String(e?.target ?? '');

      if (!singleInputTargets.has(target)) continue;

      const last = lastIncomingIndex.get(target);
      if (last === i) {
        // Make port explicit for stability
        e.targetPort = e.targetPort ?? 'port-left';
        keptEdges.push(edges[i]);
      }
    }

    return { nodes, edges: keptEdges };
  }
}
