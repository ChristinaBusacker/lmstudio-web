import type {
  IncomingEdge,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from './graph-types';
import { asJsonArray, asJsonObject, getString, isJsonObject } from './typed-access';

type RawEdge = Record<string, unknown>;

function normalizeEdges(graph: WorkflowGraph, nodeIds: Set<string>): WorkflowGraphEdge[] {
  const raw = asJsonArray(graph.edges).filter(isJsonObject) as RawEdge[];
  const out: WorkflowGraphEdge[] = [];

  for (const e of raw) {
    const source = getString(e.source).trim();
    const target = getString(e.target).trim();
    if (!source || !target) continue;
    if (source === target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;

    out.push({
      id: getString(e.id, `${source}->${target}`),
      source,
      target,
      sourcePort: getString(e.sourcePort).trim() || undefined,
      targetPort: getString(e.targetPort).trim() || undefined,
    });
  }

  // Dedupe + stable
  const seen = new Set<string>();
  const deduped: WorkflowGraphEdge[] = [];
  for (const e of out) {
    const k = `${e.source}->${e.target}|${e.sourcePort ?? ''}|${e.targetPort ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }

  return deduped.sort((a, b) => a.id.localeCompare(b.id));
}

function deriveEdgesFromLegacyInputFrom(
  nodes: WorkflowGraphNode[],
  nodeIds: Set<string>,
): WorkflowGraphEdge[] {
  const out: WorkflowGraphEdge[] = [];
  for (const n of nodes) {
    const target = getString(n.id).trim();
    const source = getString(n.inputFrom).trim();
    if (!source || !target) continue;
    if (source === target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    out.push({
      id: `${source}->${target}`,
      source,
      target,
      sourcePort: 'port-right',
      targetPort: 'port-left',
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function normalizeWorkflowGraph(graph: WorkflowGraph) {
  const nodesRaw = asJsonArray(graph.nodes);
  const nodes: WorkflowGraphNode[] = [];

  for (const n of nodesRaw) {
    const obj = asJsonObject(n);
    const id = getString(obj.id).trim();
    if (!id) continue;
    nodes.push({
      ...(obj as WorkflowGraphNode),
      id,
      type: getString(obj.type).trim() || undefined,
      title: getString(obj.title).trim() || undefined,
      prompt: getString(obj.prompt),
      inputFrom: getString(obj.inputFrom).trim() || undefined,
      config: asJsonObject(obj.config),
    });
  }

  const ids = nodes.map((n) => n.id);
  const nodeIds = new Set(ids);

  const edges = normalizeEdges(graph, nodeIds);
  const finalEdges = edges.length ? edges : deriveEdgesFromLegacyInputFrom(nodes, nodeIds);

  const incoming = new Map<string, IncomingEdge[]>();
  for (const e of finalEdges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e);
  }
  for (const arr of incoming.values()) arr.sort((a, b) => a.id.localeCompare(b.id));

  const nodeById = new Map<string, WorkflowGraphNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  return { nodes, ids, nodeIds, edges: finalEdges, incoming, nodeById };
}
