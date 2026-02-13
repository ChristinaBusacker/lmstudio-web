/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  effect,
  EnvironmentInjector,
  HostBinding,
  HostListener,
  inject,
  runInInjectionContext,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import {
  configureShortcuts,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramConfig,
  NgDiagramModelService,
  NgDiagramNodeTemplateMap,
  NgDiagramSelectionService,
  provideNgDiagram,
  type EdgeDrawnEvent,
} from 'ng-diagram';
import { distinctUntilChanged, filter, map } from 'rxjs';

import { SseService } from '../../core/sse/sse.service';
import { WorkflowApiService } from '../../core/api/workflow-api.service';
import { SettingsState } from '../../core/state/settings/settings.state';
import { SetSelectedWorkflow, StartWorkflowRun } from '../../core/state/workflows/workflow.actions';
import { WorkflowsState } from '../../core/state/workflows/workflow.state';
import { Icon } from '../../ui/icon/icon';
import { WorkflowNodeComponent } from './components/workflow-node/workflow-node';
import { WorkflowRunListContainer } from './components/workflow-run-list-container/workflow-run-list-container';
import { WorkflowDiagramCommandsService } from './workflow-diagram-commands.service';
import { WORKFLOW_NODE_TEMPLATE } from './workflow-diagram.adapter';
import { WorkflowDiagramFacade } from './workflow-diagram.facade';
import { WorkflowEditorStateService } from './workflow-editor-state.service';

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;

  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option') return true;

  // Any element inside an input/textarea/select should be treated as editable.
  if (el.closest('input, textarea, select, option')) return true;

  return el.isContentEditable === true;
}

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
  providers: [
    provideNgDiagram(),
    WorkflowDiagramCommandsService,
    WorkflowEditorStateService,
    WorkflowDiagramFacade,
  ],
  templateUrl: './workflow-page.html',
  styleUrl: './workflow-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly sse = inject(SseService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly envInjector = inject(EnvironmentInjector);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly workflowApi = inject(WorkflowApiService);
  readonly commands = inject(WorkflowDiagramCommandsService);
  readonly facade = inject(WorkflowDiagramFacade);
  private readonly editorState = inject(WorkflowEditorStateService);

  workflowId!: string;

  readonly workflow$ = this.store.select(WorkflowsState.selectedWorkflow);
  readonly selectedRun = this.store.select(WorkflowsState.selectedRun);
  readonly runDetails = this.store.select(WorkflowsState.selectedRunDetails);
  readonly loading = this.store.select(WorkflowsState.loading);
  readonly error = this.store.select(WorkflowsState.error);
  readonly profiles$ = this.store.select(SettingsState.profiles);
  private readonly selection = inject(NgDiagramSelectionService);
  readonly editorDirty = this.editorState.dirty;

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

  model: unknown = null;

  @HostBinding('class.runbar-open') runbarOpen = false;

  constructor() {
    effect(() => {
      if (this.editorState.consumeSnapshotRequest()) {
        this.facade.ensureDataEditSnapshot();
      }
    });

    this.route.paramMap
      .pipe(
        map((pm) => pm.get('workflowId')),
        filter((id): id is string => !!id),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((workflowId) => {
        this.workflowId = workflowId;

        this.sse.connectWorkflow(workflowId);
        this.store.dispatch(new SetSelectedWorkflow(workflowId));
      });

    this.destroyRef.onDestroy(() => {
      this.sse.disconnectWorkflow();
    });

    this.workflow$
      .pipe(
        filter((wf): wf is any => !!wf),
        filter((wf) => wf.id === this.workflowId),
        distinctUntilChanged((a, b) => a.id === b.id && a.updatedAt === b.updatedAt),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((wf) => {
        // Defer model update to avoid NG0100
        queueMicrotask(() => {
          runInInjectionContext(this.envInjector, () => {
            this.model = this.facade.loadWorkflowGraph(wf).model;
          });
        });
      });
  }

  onDiagramInit(): void {
    this.facade.onDiagramInit();
  }

  onDiagramMouseMove(e: MouseEvent): void {
    this.commands.setLastMouseClientPosition({ x: e.clientX, y: e.clientY });
  }

  onDiagramPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (isEditableTarget(e.target)) return;

    this.facade.onPointerDownStartTracking();
  }

  onDiagramWheel(e: WheelEvent): void {
    // When scrolling inside inputs/textareas (esp. on touchpads) we must not
    // trigger diagram zoom/pan handlers.
    if (!isEditableTarget(e.target)) return;
    e.stopPropagation();
  }

  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  @HostListener('window:blur')
  onPointerUp(): void {
    // Make sure dragging/tracking can't get stuck (touchpads, dropdowns, etc.)
    this.facade.onPointerUpFinishTracking();
  }

  onSelectionMoved(): void {
    this.facade.markDirty();
  }

  onEdgeDrawn(e: EdgeDrawnEvent): void {
    this.facade.onEdgeDrawn(e);
  }

  addNode(): void {
    this.facade.addNode();
  }

  saveGraph(): void {
    this.facade.saveSelectedWorkflow();
  }

  startRun(workflowId: string): void {
    this.store.dispatch(new StartWorkflowRun(workflowId));
  }

  undo(): void {
    this.facade.undo();
  }

  redo(): void {
    this.facade.redo();
  }

  resetToLastSaved(): void {
    this.facade.resetToLastSaved();
  }

  exportWorkflow(): void {
    const workflowId = this.workflowId;
    if (!workflowId) return;

    const wf = this.store.selectSnapshot(WorkflowsState.selectedWorkflow) as any;
    const baseName = (wf?.name ? String(wf.name) : `workflow-${workflowId}`)
      .replace(/[^\w\-]+/g, '_')
      .trim();
    const filename = `${baseName}.json`;

    this.workflowApi.exportWorkflowBundle(workflowId, { includeRuns: false }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => console.error('[WorkflowPage] exportWorkflow failed', err),
    });
  }

  async importWorkflow(file: File | null): Promise<void> {
    if (!file) return;

    try {
      const text = await file.text();
      const bundle = JSON.parse(text);

      this.workflowApi.importWorkflowBundle(bundle).subscribe({
        next: (wf) => {
          void this.router.navigate(['/workflow', wf.id]);
        },
        error: (err) => console.error('[WorkflowPage] importWorkflow failed', err),
      });
    } catch (err) {
      console.error('[WorkflowPage] importWorkflow parse failed', err);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
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

    if (mod && key === 'a') {
      stop();

      const model = this.model as any;
      const nodes = model.nodes().map((n) => n.id);
      const edges = model.edges().map((e) => e.id);

      this.selection.select(nodes, edges);

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
      this.commands.copy();
      return;
    }

    if (key === 'x') {
      stop();
      this.facade.onPointerDownStartTracking();
      this.commands.cut();
      this.facade.markDirty();
      return;
    }

    if (key === 'v') {
      stop();
      this.facade.onPointerDownStartTracking();
      this.commands.paste();
      this.facade.markDirty();
      return;
    }

    if (key === 'backspace') {
      stop();
      this.resetToLastSaved();
    }
  }
}
