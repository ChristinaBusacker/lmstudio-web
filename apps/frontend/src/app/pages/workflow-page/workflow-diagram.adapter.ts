/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Workflow } from '@frontend/src/app/core/state/workflows/workflow.models';

/**
 * Persisted WorkflowGraph (v2)
 * - nodes[]
 * - edges[]: source -> target
 *
 * Legacy migration:
 * - if edges are missing, derive edges from node.inputFrom (v1)
 */
export type WorkflowGraph = {
  nodes: Array<{
    id: string;
    type: string;
    profileName?: string;
    prompt?: string;
    position?: { x: number; y: number };

    // legacy only (read-only for migration)
    inputFrom?: string | null;
  }>;

  edges?: Array<{
    id: string;
    source: string;
    target: string;

    // These are important for preserving arrow direction and rendering
    sourcePort?: string;
    targetPort?: string;
    type?: string;

    // ng-diagram often stores styling/marker config here
    data?: any;

    // allow additional properties without losing them
    [key: string]: any;
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

type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  type?: string;
  data?: any;
  [key: string]: any;
};

function sortById<T extends { id: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeNodes(input: any): WorkflowGraph['nodes'] {
  const spacingX = 340;
  const spacingY = 140;

  const raw: any[] = Array.isArray(input?.nodes) ? input.nodes : [];

  return raw
    .filter((n) => !!n?.id)
    .map((n, idx) => ({
      id: String(n.id),
      type: String(n.type ?? 'lmstudio.llm'),
      profileName: String(n.profileName ?? ''),
      prompt: String(n.prompt ?? ''),
      // keep legacy in memory (migration), but don’t rely on it long-term
      inputFrom:
        n.inputFrom === undefined ? null : n.inputFrom === null ? null : String(n.inputFrom),
      position: n.position
        ? { x: Number(n.position.x ?? 0), y: Number(n.position.y ?? 0) }
        : { x: 40 + (idx % 2) * spacingX, y: 40 + Math.floor(idx / 2) * spacingY },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeEdgesPreserveAll(input: any, nodeIds: Set<string>): DiagramEdge[] {
  const raw: any[] = Array.isArray(input?.edges) ? input.edges : [];
  const out: DiagramEdge[] = [];

  for (const e of raw) {
    const source = String(e?.source ?? '').trim();
    const target = String(e?.target ?? '').trim();
    if (!source || !target) continue;
    if (source === target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;

    // IMPORTANT: preserve all edge props so arrows/styles survive reload
    out.push({
      ...e,
      id: String(e?.id ?? `${source}->${target}`),
      source,
      target,
      sourcePort: e?.sourcePort ? String(e.sourcePort) : undefined,
      targetPort: e?.targetPort ? String(e.targetPort) : undefined,
      type: e?.type ? String(e.type) : undefined,
      data: e?.data ?? {},
    });
  }

  // Dedupe by (source->target) but keep the first encountered edge props
  const seen = new Set<string>();
  const deduped: DiagramEdge[] = [];
  for (const e of out) {
    const k = `${e.source}->${e.target}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }

  return sortById(deduped);
}

function deriveEdgesFromLegacyInputFrom(nodes: WorkflowGraph['nodes']): DiagramEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const out: DiagramEdge[] = [];

  for (const n of nodes) {
    const from = (n.inputFrom ?? '').trim();
    if (!from) continue;
    if (!ids.has(from)) continue;
    if (from === n.id) continue;

    out.push({
      id: `${from}->${n.id}`,
      source: from,
      target: n.id,
      sourcePort: DEFAULT_SOURCE_PORT,
      targetPort: DEFAULT_TARGET_PORT,
      // NOTE: type/data unknown in legacy, but ports + id are enough for directional render
      data: {},
    });
  }

  return sortById(out);
}

export function normalizeWorkflowGraph(input: any): WorkflowGraph {
  const nodes = normalizeNodes(input);
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Use persisted edges if present; otherwise migrate legacy inputFrom
  const persistedEdges = normalizeEdgesPreserveAll(input, nodeIds);
  const edges = persistedEdges.length ? persistedEdges : deriveEdgesFromLegacyInputFrom(nodes);

  return { nodes, edges };
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

    edges: (graph.edges ?? []).map((e) => ({
      ...e,
      id: String(e.id ?? `${e.source}->${e.target}`),
      source: e.source,
      target: e.target,
      sourcePort: e.sourcePort ?? DEFAULT_SOURCE_PORT,
      targetPort: e.targetPort ?? DEFAULT_TARGET_PORT,
      type: e.type ?? undefined,
      data: e.data ?? {},
    })),
  };
}

/**
 * Diagram JSON -> Persisted Graph
 * - Persists nodes[] + edges[] (including rendering metadata)
 * - Does NOT persist inputFrom anymore
 */
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
    // keep edges as-is so we do not lose arrow metadata
    edges: edges.map((e: any) => ({ ...e })),
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
