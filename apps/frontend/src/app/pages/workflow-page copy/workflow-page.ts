import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngxs/store';
import { interval } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import {
  WORKFLOW_NODE_TEMPLATE,
  createNewNodeId,
  diagramJsonToWorkflowGraph,
  workflowToDiagramModel,
} from './workflow-diagram.adapter';

import {
  initializeModel,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramConfig,
  NgDiagramModelService,
  NgDiagramNodeTemplateMap,
  provideNgDiagram,
} from 'ng-diagram';
import {
  LoadWorkflows,
  LoadWorkflowRuns,
  LoadWorkflowRunDetails,
  SetSelectedWorkflow,
  ClearWorkflowErrors,
  CreateWorkflow,
  UpdateWorkflow,
  StartWorkflowRun,
  SetSelectedRun,
  RerunWorkflowFromNode,
} from '../../core/state/workflows/workflow.actions';
import { Workflow, WorkflowRunDetails } from '../../core/state/workflows/workflow.models';
import { WorkflowsState } from '../../core/state/workflows/workflow.state';
import { WorkflowNodeComponent } from './components/workflow-node/workflow-node';

@Component({
  selector: 'app-workflows-playground-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgDiagramComponent, NgDiagramBackgroundComponent],
  providers: [provideNgDiagram()],
  templateUrl: './workflow-page.html',
  styleUrls: ['./workflow-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowsPlaygroundPage {
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);

  // ngDiagram model service (scoped by provideNgDiagram())
  private readonly diagramModel = inject(NgDiagramModelService);

  // custom node template map
  readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
    [WORKFLOW_NODE_TEMPLATE, WorkflowNodeComponent],
  ]);

  // config (zoomToFit is handy on init)
  readonly config: NgDiagramConfig = {
    zoom: {
      max: 3,
      zoomToFit: { onInit: true, padding: 120 },
    },
  };

  // -------------------------
  // Store -> signals
  // -------------------------
  readonly workflows = toSignal(this.store.select(WorkflowsState.workflows), { initialValue: [] });
  readonly selectedWorkflow = toSignal(this.store.select(WorkflowsState.selectedWorkflow), {
    initialValue: null,
  });

  readonly runs = toSignal(this.store.select(WorkflowsState.runs), { initialValue: [] });
  readonly selectedRun = toSignal(this.store.select(WorkflowsState.selectedRun), {
    initialValue: null,
  });
  readonly runDetails = toSignal(this.store.select(WorkflowsState.selectedRunDetails), {
    initialValue: null,
  });

  readonly loading = toSignal(this.store.select(WorkflowsState.loading), {
    initialValue: { workflows: false, runs: false, runDetails: false },
  });

  readonly error = toSignal(this.store.select(WorkflowsState.error), { initialValue: null });

  // -------------------------
  // Local UI state
  // -------------------------
  readonly editorDirty = signal(false);

  readonly newWorkflowName = new FormControl('New Workflow', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly newWorkflowDescription = new FormControl('', { nonNullable: true });

  readonly newRunLabel = new FormControl('Draft', { nonNullable: true });

  readonly canSave = computed(() => this.editorDirty() && !!this.selectedWorkflow());

  // ngDiagram model adapter instance
  model: unknown = initializeModel({ nodes: [], edges: [] });

  constructor() {
    this.store.dispatch(new LoadWorkflows());

    // Load workflow -> build diagram model
    effect(() => {
      const wf = this.selectedWorkflow();
      if (!wf) {
        this.model = initializeModel({ nodes: [], edges: [] });
        this.editorDirty.set(false);
        return;
      }
      const { nodes, edges } = workflowToDiagramModel(wf);
      this.model = initializeModel({ nodes, edges });
      this.editorDirty.set(false);
    });

    // when workflow changes: load runs
    effect(() => {
      const wf = this.selectedWorkflow();
      if (!wf) return;
      this.store.dispatch(new LoadWorkflowRuns({ workflowId: wf.id, limit: 50 }));
    });

    // Poll runs + selected run details (MVP; later SSE)
    interval(2000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const wf = this.selectedWorkflow();
        if (wf?.id) this.store.dispatch(new LoadWorkflowRuns({ workflowId: wf.id, limit: 50 }));

        const run = this.selectedRun();
        if (run?.id) this.store.dispatch(new LoadWorkflowRunDetails(run.id));
      });
  }

  // -------------------------
  // Workflows
  // -------------------------
  selectWorkflow(wf: Workflow) {
    this.editorDirty.set(false);
    this.store.dispatch(new SetSelectedWorkflow(wf.id));
    this.store.dispatch(new ClearWorkflowErrors());
  }

  createWorkflow() {
    const name = this.newWorkflowName.value.trim();
    if (!name) return;

    const description = this.newWorkflowDescription.value.trim();
    const graph = { nodes: [], edges: [] };

    this.store.dispatch(new CreateWorkflow({ name, description: description || undefined, graph }));
  }

  // Add a node directly into diagram (uses model service to keep reactivity)
  addNode(kind: 'author' | 'book' | 'llm') {
    const existing = this.diagramModel.nodes().map((n) => n.id);
    const id = createNewNodeId(existing, kind);

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

    this.editorDirty.set(true);
  }

  // ngDiagram events -> mark dirty
  onEdgeDrawn() {
    this.editorDirty.set(true);
  }

  onSelectionMoved() {
    this.editorDirty.set(true);
  }

  saveGraph() {
    const wf = this.selectedWorkflow();
    if (!wf) return;

    // Serialize diagram -> workflow graph
    const diagramJson = this.diagramModel.toJSON();
    const graph = diagramJsonToWorkflowGraph(diagramJson);

    this.editorDirty.set(false);
    this.store.dispatch(new UpdateWorkflow(wf.id, { graph }));
  }

  // -------------------------
  // Runs
  // -------------------------
  startRun() {
    const wf = this.selectedWorkflow();
    if (!wf) return;

    const label = this.newRunLabel.value.trim();
    this.store.dispatch(new StartWorkflowRun(wf.id, { label: label || undefined }));
  }

  selectRun(runId: string) {
    this.store.dispatch(new SetSelectedRun(runId));
    this.store.dispatch(new LoadWorkflowRunDetails(runId));
  }

  rerunFrom(details: WorkflowRunDetails | null, nodeId: string) {
    if (!details?.run?.id) return;
    this.store.dispatch(new RerunWorkflowFromNode(details.run.id, nodeId));
  }
}
