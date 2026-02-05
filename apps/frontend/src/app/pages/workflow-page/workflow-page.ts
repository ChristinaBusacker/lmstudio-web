/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
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
import { SetSelectedWorkflow, UpdateWorkflow } from '../../core/state/workflows/workflow.actions';
import { WorkflowsState } from '../../core/state/workflows/workflow.state';
import { shortId } from '../../core/utils/shortId.util';
import { Icon } from '../../ui/icon/icon';
import { WorkflowNodeComponent } from './components/workflow-node/workflow-node';
import { WorkflowDiagramCommandsService } from './workflow-diagram-commands.service';
import {
  diagramJsonToWorkflowGraph,
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

  // ngDiagram model service (scoped by provideNgDiagram())
  private readonly diagramModel = inject(NgDiagramModelService);

  workflowId!: string;

  private dataEditSnapshotTaken = false;

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

  // Pattern A: signature gate for store -> editor apply
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
    this.route.paramMap
      .pipe(
        map((pm) => pm.get('workflowId')),
        filter((id): id is string => !!id),
        distinctUntilChanged(),
        tap((workflowId) => {
          this.workflowId = workflowId;
          this.store.dispatch(new SetSelectedWorkflow(workflowId));
        }),
        switchMap(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    this.workflow$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((wf) => {
      runInInjectionContext(this.envInjector, () => {
        if (!wf) {
          this.resetEditorForEmpty();
          return;
        }

        const incomingSig = this.workflowGraphSig(wf);

        // Protect local edits
        if (this.editorDirty()) return;

        // Avoid re-initializing for the same content (e.g., after save)
        if (incomingSig === this.lastLoadedGraphSig) return;

        this.resetEditorForIncomingModel();

        const { nodes, edges } = workflowToDiagramModel(wf);
        // initializeModel uses signals internally => keep in injection context
        this.model = initializeModel({ nodes, edges });

        this.lastLoadedGraphSig = incomingSig;
        // lastSavedSnapshot will be set in onDiagramInit() when diagramModel is ready
      });
    });
  }

  // Called from template: (diagramInit)="onDiagramInit()"
  onDiagramInit() {
    this.diagramReady = true;

    // Now it's SAFE to read diagramModel/toJSON
    this.lastSavedSnapshot = this.snapshot();
    this.undoStack = [];
    this.redoStack = [];

    // Run queued operations (mutations) that were requested before init finished
    for (const fn of this.queuedOps) fn();
    this.queuedOps = [];
  }

  onDiagramMouseMove(e: MouseEvent) {
    this.commands.setLastMouseClientPosition({ x: e.clientX, y: e.clientY });
  }

  onDiagramPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (isEditableTarget(e.target)) return;

    // Snapshot BEFORE user starts modifying (drag / connect)
    this.runWhenReady(() => this.pushHistorySnapshot());
  }

  onSelectionMoved() {
    this.editorDirty.set(true);
  }

  onEdgeDrawn() {
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

      // Pattern A: set the signature we *expect* to receive back from the store,
      // so the store emission after save doesn't reinitialize the model.
      this.lastLoadedGraphSig = JSON.stringify(graph);

      this.store.dispatch(new UpdateWorkflow(wf.id, { graph }));

      this.editorDirty.set(false);
      this.lastSavedSnapshot = this.snapshot();
      this.undoStack = [];
      this.redoStack = [];
    });
  }

  resetToLastSaved() {
    this.runWhenReady(() => {
      if (!this.lastSavedSnapshot) return;
      this.pushHistorySnapshot();
      this.applySnapshot(structuredClone(this.lastSavedSnapshot));
      this.editorDirty.set(false);
    });
  }

  undo() {
    this.runWhenReady(() => {
      if (this.undoStack.length === 0) return;

      const current = this.snapshot();
      const previous = this.undoStack.pop()!;

      this.redoStack.push(current);
      this.applySnapshot(previous);
      this.editorDirty.set(true);
    });
  }

  redo() {
    this.runWhenReady(() => {
      if (this.redoStack.length === 0) return;

      const current = this.snapshot();
      const next = this.redoStack.pop()!;

      this.undoStack.push(current);
      this.applySnapshot(next);
      this.editorDirty.set(true);
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;

    const key = e.key.toLowerCase();
    const ctrlOrCmd = e.ctrlKey || e.metaKey;
    if (!ctrlOrCmd) return;

    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (key === 's') {
      stop();
      this.saveGraph();
      return;
    }

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

    // reset nach kurzer Pause, damit längere Bearbeitung wieder einen sinnvollen Undo-Step bekommt
    window.clearTimeout((this as any)._dataEditTimer);
    (this as any)._dataEditTimer = window.setTimeout(() => {
      this.dataEditSnapshotTaken = false;
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

  private workflowGraphSig(wf: any): string {
    return JSON.stringify(wf?.graph ?? null);
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
