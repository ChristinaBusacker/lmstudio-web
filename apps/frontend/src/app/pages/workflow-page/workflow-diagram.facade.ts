/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { NgDiagramModelService, type Edge, type Node, initializeModel } from 'ng-diagram';

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

  readonly dirty = this.editorState.dirty;

  readonly canUndo = computed(() => this.undoStack.length > 0);
  readonly canRedo = computed(() => this.redoStack.length > 0);
  readonly canReset = computed(() => !!this.lastSavedSnapshot);

  constructor() {
    // React to node-editor snapshot requests in a valid injection context.
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
   * Pure loading method: no effects, no reactive setup, no injections.
   * It only returns a model based on current state and input.
   */
  loadWorkflowGraph(workflow: { graph?: unknown } | null): { model: DiagramModel } {
    if (!workflow) {
      this.resetEditorForEmpty();
      return { model: initializeModel({ nodes: [], edges: [] }) };
    }

    const incomingSig = this.workflowGraphSig(workflow);

    if (this.dirty()) return { model: initializeModel(this.currentDiagramModelData()) };
    if (incomingSig === this.lastLoadedGraphSig) {
      return { model: initializeModel(this.currentDiagramModelData()) };
    }

    this.resetEditorForIncomingModel();

    const { nodes, edges } = workflowToDiagramModel(workflow as any);
    const model = initializeModel({
      nodes: nodes as DiagramNode[],
      edges: edges as DiagramEdge[],
    });

    this.lastLoadedGraphSig = incomingSig;
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
    this.runWhenReady(() => {
      const wf = this.store.selectSnapshot(WorkflowsState.selectedWorkflow);
      if (!wf) return;

      const diagramJsonString = this.modelService.toJSON();
      const graph = diagramJsonToWorkflowGraph(diagramJsonString);

      this.lastLoadedGraphSig = this.workflowGraphSig({ graph });

      this.store.dispatch(new UpdateWorkflow(wf.id, { graph: graph as any }));

      this.editorState.clearDirty();
      this.lastSavedSnapshot = this.snapshot();
      this.undoStack = [];
      this.redoStack = [];
    });
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
}
