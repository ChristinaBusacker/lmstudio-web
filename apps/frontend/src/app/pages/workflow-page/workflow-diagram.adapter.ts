/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Workflow } from '@frontend/src/app/core/state/workflows/workflow.models';

/**
 * Frontend diagram adapter for the v1 WorkflowGraph.
 *
 * Persisted graph:
 * - nodes[] only
 * - each node has ONE input via `inputFrom` (optional)
 *
 * Diagram-only:
 * - edges are derived from `inputFrom` for visualization
 */
export type WorkflowGraph = {
  nodes: Array<{
    id: string;
    type: string; // e.g. 'lmstudio.llm', 'workflow.condition', 'workflow.loop'
    profileName?: string;
    prompt?: string;
    inputFrom?: string | null;
    position?: { x: number; y: number };
  }>;
};

export type DiagramNodeData = {
  label: string;
  nodeType: string;
  profileName: string;
  prompt: string;
  /** stores the upstream node id (or empty string) */
  inputFrom: string;
};

export const WORKFLOW_NODE_TEMPLATE = 'workflowNode';
export const DEFAULT_SOURCE_PORT = 'port-right';
export const DEFAULT_TARGET_PORT = 'port-left';

type DiagramEdge = {
  id: string;
  source: string;
  target: string;
};

function deriveDiagramEdges(nodes: WorkflowGraph['nodes']): DiagramEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const out: DiagramEdge[] = [];
  for (const n of nodes) {
    const from = (n.inputFrom ?? '').trim();
    if (!from) continue;
    if (!ids.has(from)) continue;
    if (from === n.id) continue;
    out.push({ id: `${from}->${n.id}`, source: from, target: n.id });
  }
  // Stable ordering
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function normalizeWorkflowGraph(input: any): WorkflowGraph {
  const g: WorkflowGraph = {
    nodes: Array.isArray(input?.nodes) ? input.nodes : [],
  };

  const spacingX = 340;
  const spacingY = 140;

  g.nodes = g.nodes
    .filter((n) => !!n?.id)
    .map((n, idx) => ({
      id: String(n.id),
      type: String(n.type ?? 'lmstudio.llm'),
      profileName: String(n.profileName ?? ''),
      prompt: String(n.prompt ?? ''),
      inputFrom:
        n.inputFrom === undefined ? null : n.inputFrom === null ? null : String(n.inputFrom),
      position: n.position
        ? { x: Number(n.position.x ?? 0), y: Number(n.position.y ?? 0) }
        : { x: 40 + (idx % 2) * spacingX, y: 40 + Math.floor(idx / 2) * spacingY },
    }))
    // Stable ordering makes signatures/diffs deterministic.
    .sort((a, b) => a.id.localeCompare(b.id));

  return g;
}

export function workflowToDiagramModel(workflow: Workflow) {
  const graph = normalizeWorkflowGraph(workflow.graph);
  const edges = deriveDiagramEdges(graph.nodes);

  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      position: n.position!,
      type: WORKFLOW_NODE_TEMPLATE,
      data: {
        label: n.id,
        nodeType: n.type,
        profileName: n.profileName ?? '',
        prompt: n.prompt ?? '',
        inputFrom: (n.inputFrom ?? '') || '',
      } satisfies DiagramNodeData,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourcePort: DEFAULT_SOURCE_PORT,
      targetPort: DEFAULT_TARGET_PORT,
      data: {},
    })),
  };
}

/**
 * Converts diagram JSON into a persisted WorkflowGraph.
 *
 * Important: edges are ignored. We only persist node `inputFrom`.
 */
export function diagramJsonToWorkflowGraph(diagramJson: string): WorkflowGraph {
  const json = JSON.parse(diagramJson);
  const nodes = Array.isArray(json?.nodes) ? json.nodes : [];

  return normalizeWorkflowGraph({
    nodes: nodes.map((n: any) => ({
      id: String(n.id),
      type: String(n.data?.nodeType ?? 'lmstudio.llm'),
      profileName: String(n.data?.profileName ?? ''),
      prompt: String(n.data?.prompt ?? ''),
      inputFrom: n.data?.inputFrom ? String(n.data.inputFrom) : null,
      position: n.position ? { x: Number(n.position.x), y: Number(n.position.y) } : undefined,
    })),
  });
}

export function createNewNodeId(existingIds: string[], base: string) {
  let i = 1;
  let id = base;
  while (existingIds.includes(id)) {
    i += 1;
    id = `${base}${i}`;
  }
  return id;
}
