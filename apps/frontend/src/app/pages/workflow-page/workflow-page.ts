/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  effect,
  EnvironmentInjector,
  HostListener,
  inject,
  OnInit,
  runInInjectionContext,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Store } from '@ngxs/store';
import {
  configureShortcuts,
  initializeModel,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramConfig,
  NgDiagramModelService,
  NgDiagramNodeTemplateMap,
  provideNgDiagram,
} from 'ng-diagram';
import { distinctUntilChanged, filter, map, of, switchMap, tap } from 'rxjs';

import { SseService } from '../../core/sse/sse.service';
import { SettingsState } from '../../core/state/settings/settings.state';
import {
  SetSelectedWorkflow,
  StartWorkflowRun,
  UpdateWorkflow,
} from '../../core/state/workflows/workflow.actions';
import { WorkflowsState } from '../../core/state/workflows/workflow.state';
import { shortId } from '../../core/utils/shortId.util';
import { Icon } from '../../ui/icon/icon';
import { WorkflowNodeComponent } from './components/workflow-node/workflow-node';
import { WorkflowRunListContainer } from './components/workflow-run-list-container/workflow-run-list-container';
import { WorkflowDiagramCommandsService } from './workflow-diagram-commands.service';
import {
  diagramJsonToWorkflowGraph,
  normalizeWorkflowGraph,
  WORKFLOW_NODE_TEMPLATE,
  workflowToDiagramModel,
} from './workflow-diagram.adapter';
import { WorkflowEditorStateService } from './workflow-editor-state.service';

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return el.isContentEditable === true;
}

type GraphSnapshot = { nodes: any[]; edges: any[] };

@Component({
  selector: 'app-workflow-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgDiagramComponent,
    NgDiagramBackgroundComponent,
    Icon,
    WorkflowRunListContainer,
  ],
  providers: [provideNgDiagram(), WorkflowDiagramCommandsService, WorkflowEditorStateService],
  templateUrl: './workflow-page.html',
  styleUrl: './workflow-page.scss',
})
export class WorkflowPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly sse = inject(SseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly commands = inject(WorkflowDiagramCommandsService);
  private readonly envInjector = inject(EnvironmentInjector);

  private readonly diagramModel = inject(NgDiagramModelService);

  workflowId!: string;

  private dataEditSnapshotTaken = false;
  private dataEditTimer: number | null = null;

  readonly workflow$ = this.store.select(WorkflowsState.selectedWorkflow);
  readonly selectedRun = this.store.select(WorkflowsState.selectedRun);
  readonly runDetails = this.store.select(WorkflowsState.selectedRunDetails);
  readonly loading = this.store.select(WorkflowsState.loading);
  readonly error = this.store.select(WorkflowsState.error);
  readonly profiles$ = this.store.select(SettingsState.profiles);

  private readonly editorState = inject(WorkflowEditorStateService);
  readonly editorDirty = this.editorState.dirty;

  private undoStack: GraphSnapshot[] = [];
  private redoStack: GraphSnapshot[] = [];
  private lastSavedSnapshot: GraphSnapshot | null = null;

  private lastLoadedGraphSig: string | null = null;

  private diagramReady = false;
  private queuedOps: Array<() => void> = [];

  readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
    [WORKFLOW_NODE_TEMPLATE, WorkflowNodeComponent],
  ]);

  readonly config: NgDiagramConfig = {
    zoom: {
      max: 3,
      zoomToFit: { onInit: true, padding: 120 },
    },
    shortcuts: configureShortcuts([
      { actionName: 'copy', bindings: [] },
      { actionName: 'cut', bindings: [] },
      { actionName: 'paste', bindings: [] },
      { actionName: 'undo', bindings: [] },
      { actionName: 'redo', bindings: [] },
    ]),
  };

  model: unknown = initializeModel({ nodes: [], edges: [] });

  ngOnInit() {
    // Node-data edits request snapshots; we consume that here.
    runInInjectionContext(this.envInjector, () => {
      effect(() => {
        if (this.editorState.consumeSnapshotRequest()) {
          this.runWhenReady(() => this.ensureDataEditSnapshot());
        }
      });
    });

    this.route.paramMap
      .pipe(
        map((pm) => pm.get('workflowId')),
        filter((id): id is string => !!id),
        distinctUntilChanged(),
        tap((workflowId) => {
          this.workflowId = workflowId;

          // ✅ Connect workflow SSE so run list updates live
          this.sse.connectWorkflow(workflowId);

          this.store.dispatch(new SetSelectedWorkflow(workflowId));
        }),
        switchMap(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    // on destroy: stop the workflow stream
    this.destroyRef.onDestroy(() => {
      this.sse.disconnectWorkflow();
    });

    this.workflow$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((wf) => {
      runInInjectionContext(this.envInjector, () => {
        if (!wf) {
          this.resetEditorForEmpty();
          return;
        }

        const incomingSig = this.workflowGraphSig(wf);

        // Protect local edits
        if (this.editorDirty()) return;

        // Avoid re-initializing for same content
        if (incomingSig === this.lastLoadedGraphSig) return;

        this.resetEditorForIncomingModel();

        const { nodes, edges } = workflowToDiagramModel(wf);
        this.model = initializeModel({ nodes, edges });

        this.lastLoadedGraphSig = incomingSig;
      });
    });
  }

  onDiagramInit() {
    this.diagramReady = true;

    this.lastSavedSnapshot = this.snapshot();
    this.undoStack = [];
    this.redoStack = [];

    for (const fn of this.queuedOps) fn();
    this.queuedOps = [];
  }

  onDiagramMouseMove(e: MouseEvent) {
    this.commands.setLastMouseClientPosition({ x: e.clientX, y: e.clientY });
  }

  onDiagramPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (isEditableTarget(e.target)) return;
    this.runWhenReady(() => this.pushHistorySnapshot());
  }

  onSelectionMoved() {
    this.editorDirty.set(true);
  }

  addNode(kind: 'author' | 'book' | 'llm') {
    this.runWhenReady(() => {
      this.pushHistorySnapshot();
      this.editorDirty.set(true);

      const existing = this.diagramModel.nodes().map((n) => n.id);
      const id = shortId();

      const x = 60 + existing.length * 40;
      const y = 60 + existing.length * 30;

      this.diagramModel.addNodes([
        {
          id,
          type: WORKFLOW_NODE_TEMPLATE,
          position: { x, y },
          data: {
            label: id,
            nodeType: 'lmstudio.llm',
            profileName:
              kind === 'author' ? 'Personen Generator' : kind === 'book' ? 'Buch-Generator' : '',
            prompt: '',
            inputFrom: '',
          },
        },
      ]);
    });
  }

  saveGraph() {
    this.runWhenReady(() => {
      const wf = this.store.selectSnapshot(WorkflowsState.selectedWorkflow);
      if (!wf) return;

      const diagramJsonString = this.diagramModel.toJSON();
      const graph = diagramJsonToWorkflowGraph(diagramJsonString);

      this.lastLoadedGraphSig = this.workflowGraphSig({ graph });

      this.store.dispatch(new UpdateWorkflow(wf.id, { graph }));

      this.editorDirty.set(false);
      this.lastSavedSnapshot = this.snapshot();
      this.undoStack = [];
      this.redoStack = [];
    });
  }

  startRun(workflowId: string) {
    this.store.dispatch(new StartWorkflowRun(workflowId));
  }

  undo() {
    this.runWhenReady(() => {
      const prev = this.undoStack.pop();
      if (!prev) return;

      this.redoStack.push(this.snapshot());
      this.applySnapshot(prev);
      this.editorDirty.set(true);
    });
  }

  redo() {
    this.runWhenReady(() => {
      const next = this.redoStack.pop();
      if (!next) return;

      this.undoStack.push(this.snapshot());
      this.applySnapshot(next);
      this.editorDirty.set(true);
    });
  }

  resetToLastSaved() {
    this.runWhenReady(() => {
      if (!this.lastSavedSnapshot) return;
      this.applySnapshot(this.lastSavedSnapshot);
      this.editorDirty.set(false);
      this.undoStack = [];
      this.redoStack = [];
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    // keep existing shortcuts behavior
    if (isEditableTarget(e.target)) return;
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (mod && key === 's') {
      stop();
      this.saveGraph();
      return;
    }

    if (!mod) return;

    if (key === 'z' && !e.shiftKey) {
      stop();
      this.undo();
      return;
    }

    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      stop();
      this.redo();
      return;
    }

    if (key === 'c') {
      stop();
      this.runWhenReady(() => this.commands.copy());
      return;
    }

    if (key === 'x') {
      stop();
      this.runWhenReady(() => {
        this.pushHistorySnapshot();
        this.editorDirty.set(true);
        this.commands.cut();
      });
      return;
    }

    if (key === 'v') {
      stop();
      this.runWhenReady(() => {
        this.pushHistorySnapshot();
        this.editorDirty.set(true);
        this.commands.paste();
      });
      return;
    }

    if (key === 'backspace') {
      stop();
      this.resetToLastSaved();
    }
  }

  // ---------- internals ----------

  private ensureDataEditSnapshot() {
    if (this.dataEditSnapshotTaken) return;
    this.pushHistorySnapshot();
    this.dataEditSnapshotTaken = true;

    if (this.dataEditTimer !== null) window.clearTimeout(this.dataEditTimer);
    this.dataEditTimer = window.setTimeout(() => {
      this.dataEditSnapshotTaken = false;
      this.dataEditTimer = null;
    }, 800);
  }

  private runWhenReady(fn: () => void) {
    if (this.diagramReady) {
      fn();
      return;
    }
    this.queuedOps.push(fn);
  }

  private snapshot(): GraphSnapshot {
    const json = JSON.parse(this.diagramModel.toJSON());
    return structuredClone({
      nodes: Array.isArray(json?.nodes) ? json.nodes : [],
      edges: Array.isArray(json?.edges) ? json.edges : [],
    });
  }

  private pushHistorySnapshot() {
    this.undoStack.push(this.snapshot());
    this.redoStack = [];
  }

  private applySnapshot(snapshot: GraphSnapshot) {
    const existingNodeIds = this.diagramModel.nodes().map((n) => n.id);
    if (existingNodeIds.length) this.diagramModel.deleteNodes(existingNodeIds);

    if (snapshot.nodes?.length) this.diagramModel.addNodes(snapshot.nodes);
    if (snapshot.edges?.length) this.diagramModel.addEdges(snapshot.edges);
  }

  private workflowGraphSig(wf: { graph?: unknown } | null): string {
    return JSON.stringify(normalizeWorkflowGraph(wf?.graph ?? null));
  }

  private resetEditorForEmpty() {
    runInInjectionContext(this.envInjector, () => {
      this.diagramReady = false;
      this.queuedOps = [];
      this.undoStack = [];
      this.redoStack = [];
      this.lastSavedSnapshot = null;
      this.editorDirty.set(false);

      this.model = initializeModel({ nodes: [], edges: [] });
      this.lastLoadedGraphSig = null;
    });
  }

  private resetEditorForIncomingModel() {
    this.diagramReady = false;
    this.queuedOps = [];
    this.undoStack = [];
    this.redoStack = [];
    this.lastSavedSnapshot = null;
    this.editorDirty.set(false);
  }
}
