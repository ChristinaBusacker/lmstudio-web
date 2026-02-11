/*
 * Graph parsing + dependency computation for WorkflowWorkerService.
 *
 * Intentionally framework-agnostic (no NestJS imports) so it stays easy to test.
 */

export type Graph = {
  nodes?: any[];
  edges?: Array<{
    id?: string;
    source?: string;
    target?: string;
    sourcePort?: string;
    targetPort?: string;
    [key: string]: any;
  }>;
};

export type Edge = {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
};

type IncomingEdge = Edge;

// ----------------------------
// Graph normalization (v2 + legacy)
// ----------------------------

function normalizeEdges(graph: Graph, nodeIds: Set<string>): Edge[] {
  const raw = Array.isArray(graph.edges) ? graph.edges : [];
  const out: Edge[] = [];

  for (const e of raw) {
    const source = String(e?.source ?? '').trim();
    const target = String(e?.target ?? '').trim();
    if (!source || !target) continue;
    if (source === target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;

    out.push({
      id: String(e?.id ?? `${source}->${target}`),
      source,
      target,
      sourcePort: e?.sourcePort ? String(e.sourcePort) : undefined,
      targetPort: e?.targetPort ? String(e.targetPort) : undefined,
    });
  }

  // dedupe + stable
  const seen = new Set<string>();
  const deduped: Edge[] = [];
  for (const e of out) {
    const k = `${e.source}->${e.target}|${e.sourcePort ?? ''}|${e.targetPort ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }

  return deduped.sort((a, b) => a.id.localeCompare(b.id));
}

function deriveEdgesFromLegacyInputFrom(nodes: any[], nodeIds: Set<string>): Edge[] {
  const out: Edge[] = [];
  for (const n of nodes) {
    const target = String(n?.id ?? '').trim();
    const source = typeof n?.inputFrom === 'string' ? n.inputFrom.trim() : '';
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

function getNormalizedGraph(graph: Graph) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const ids = nodes.map((n) => String(n?.id ?? '')).filter(Boolean);
  const nodeIds = new Set(ids);

  const edges = normalizeEdges(graph, nodeIds);
  const finalEdges = edges.length ? edges : deriveEdgesFromLegacyInputFrom(nodes, nodeIds);

  return { nodes, ids, nodeIds, edges: finalEdges };
}

// ----------------------------
// Dependency detection
// ----------------------------

function extractNodeRefs(prompt: string): string[] {
  // supports {{nodes.X}} and {{steps.X}} (+ optional .path)
  const txt = String(prompt ?? '');
  const out: string[] = [];

  const rx = /\{\{\s*(?:nodes|steps)\.([a-zA-Z0-9_-]+)(?:\.[^}]+)?\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(txt))) out.push(m[1]);

  return out;
}

export function buildDependencies(graph: Graph) {
  const { nodes, ids, nodeIds, edges } = getNormalizedGraph(graph);

  const incoming = new Map<string, IncomingEdge[]>();
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e);
  }
  for (const [k, arr] of incoming) arr.sort((a, b) => a.id.localeCompare(b.id));

  const nodeById = new Map<string, any>();
  for (const n of nodes) if (n?.id) nodeById.set(String(n.id), n);

  const deps = new Map<string, Set<string>>();
  for (const id of ids) deps.set(id, new Set());

  for (const id of ids) {
    const n = nodeById.get(id);
    if (!n) continue;

    const prompt = String(n.prompt ?? '');

    for (const e of incoming.get(id) ?? []) {
      const src = e.source;
      if (nodeIds.has(src) && src !== id) deps.get(id)!.add(src);
    }

    for (const ref of extractNodeRefs(prompt)) {
      if (nodeIds.has(ref) && ref !== id) deps.get(id)!.add(ref);
    }
  }

  return { ids, nodeById, deps, incoming };
}

/**
 * Topological order derived from computed deps.
 * - If cycle/missing -> fall back to declared node order.
 */
export function topoSort(graph: Graph): string[] {
  const { ids, deps } = buildDependencies(graph);

  const indeg = new Map<string, number>();
  const adj = new Map<string, Set<string>>();

  for (const id of ids) indeg.set(id, 0);

  for (const [to, fromSet] of deps) {
    for (const from of fromSet) {
      indeg.set(to, (indeg.get(to) ?? 0) + 1);
      if (!adj.has(from)) adj.set(from, new Set());
      adj.get(from)!.add(to);
    }
  }

  const q: string[] = [];
  for (const [id, d] of indeg) if (d === 0) q.push(id);
  q.sort((a, b) => a.localeCompare(b));

  const out: string[] = [];
  while (q.length) {
    const cur = q.shift()!;
    out.push(cur);
    for (const nx of adj.get(cur) ?? []) {
      indeg.set(nx, (indeg.get(nx) ?? 0) - 1);
      if (indeg.get(nx) === 0) {
        q.push(nx);
        q.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  if (out.length !== ids.length) return ids;
  return out;
}
