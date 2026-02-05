/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Workflow } from '@frontend/src/app/core/state/workflows/workflow.models';

export type WorkflowGraph = {
  nodes: Array<{
    id: string;
    type: string; // e.g. 'lmstudio.llm'
    profileName?: string;
    prompt?: string;
    position?: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
};

export type DiagramNodeData = {
  label: string;
  nodeType: string;
  profileName: string;
  prompt: string;
};

export const WORKFLOW_NODE_TEMPLATE = 'workflowNode';
export const DEFAULT_SOURCE_PORT = 'port-right';
export const DEFAULT_TARGET_PORT = 'port-left';

export function normalizeWorkflowGraph(input: any): WorkflowGraph {
  const g: WorkflowGraph = {
    nodes: Array.isArray(input?.nodes) ? input.nodes : [],
    edges: Array.isArray(input?.edges) ? input.edges : [],
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
      position: n.position
        ? { x: Number(n.position.x ?? 0), y: Number(n.position.y ?? 0) }
        : { x: 40 + (idx % 2) * spacingX, y: 40 + Math.floor(idx / 2) * spacingY },
    }))
    // Stable ordering makes signatures/diffs deterministic.
    .sort((a, b) => a.id.localeCompare(b.id));

  g.edges = g.edges
    .filter((e) => !!e?.id && !!e?.source && !!e?.target)
    .map((e) => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return g;
}

export function workflowToDiagramModel(workflow: Workflow) {
  const graph = normalizeWorkflowGraph(workflow.graph);

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
      } satisfies DiagramNodeData,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourcePort: DEFAULT_SOURCE_PORT,
      targetPort: DEFAULT_TARGET_PORT,
      data: {},
    })),
  };
}

export function diagramJsonToWorkflowGraph(diagramJson: string): WorkflowGraph {
  const json = JSON.parse(diagramJson);
  const nodes = Array.isArray(json?.nodes) ? json.nodes : [];
  const edges = Array.isArray(json?.edges) ? json.edges : [];

  return normalizeWorkflowGraph({
    nodes: nodes.map((n: any) => ({
      id: String(n.id),
      type: String(n.data?.nodeType ?? 'lmstudio.llm'),
      profileName: String(n.data?.profileName ?? ''),
      prompt: String(n.data?.prompt ?? ''),
      position: n.position ? { x: Number(n.position.x), y: Number(n.position.y) } : undefined,
    })),
    edges: edges.map((e: any) => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
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
