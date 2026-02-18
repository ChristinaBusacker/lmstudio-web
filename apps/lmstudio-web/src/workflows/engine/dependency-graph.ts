import type { WorkflowGraph } from './graph-types';
import { getString } from '@shared/index';
import { buildWorkflowGraphIndex } from './graph-normalizer';

export function extractNodeRefs(prompt: string): string[] {
  // supports {{nodes.X}} and {{steps.X}} (+ optional .path)
  const txt = String(prompt ?? '');
  const out: string[] = [];

  const rx = /\{\{\s*(?:nodes|steps)\.([a-zA-Z0-9_-]+)(?:\.[^}]+)?\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(txt))) out.push(m[1]);

  return out;
}

export function buildDependencies(graph: WorkflowGraph) {
  const ids = graph.nodes.map((n) => n.id);
  const idx = buildWorkflowGraphIndex(graph);
  const { nodeIds, incoming, nodeById } = idx;

  const deps = new Map<string, Set<string>>();
  for (const id of ids) deps.set(id, new Set());

  for (const id of ids) {
    const n = nodeById.get(id);
    if (!n) continue;
    const prompt = getString(n.prompt);

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
export function topoSort(graph: WorkflowGraph): string[] {
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
