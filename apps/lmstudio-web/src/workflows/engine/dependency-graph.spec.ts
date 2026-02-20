import { buildDependencies, extractNodeRefs, topoSort } from './dependency-graph';
import type { WorkflowGraph } from './graph-types';

describe('workflows/engine/dependency-graph', () => {
  it('extractNodeRefs finds nodes.* and steps.* references (with optional paths)', () => {
    const refs = extractNodeRefs('Hello {{nodes.a}} {{steps.b.x}} {{ nodes.c.results[0].url }}');
    expect(refs).toEqual(['a', 'b', 'c']);
  });

  it('buildDependencies includes incoming edges and template refs', () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'lmstudio.llm' },
        { id: 'b', type: 'lmstudio.llm', prompt: 'use {{nodes.a.text}}' },
        { id: 'c', type: 'lmstudio.llm', prompt: 'also {{steps.a}}' },
      ],
      edges: [{ id: 'a->c', source: 'a', target: 'c' }],
    } as any;

    const { deps } = buildDependencies(graph);
    expect(Array.from(deps.get('a') ?? [])).toEqual([]);
    expect(Array.from(deps.get('b') ?? [])).toEqual(['a']);
    expect(Array.from(deps.get('c') ?? []).sort()).toEqual(['a']);
  });

  it('topoSort returns topological order and falls back to node order on cycle', () => {
    const acyclic: WorkflowGraph = {
      nodes: [
        { id: 'b', type: 'lmstudio.llm', prompt: '{{nodes.a}}' },
        { id: 'a', type: 'lmstudio.llm' },
        { id: 'c', type: 'lmstudio.llm', prompt: '{{nodes.b}}' },
      ],
      edges: [],
    } as any;

    // a must come before b, b before c
    expect(topoSort(acyclic)).toEqual(['a', 'b', 'c']);

    const cyclic: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'lmstudio.llm', prompt: '{{nodes.b}}' },
        { id: 'b', type: 'lmstudio.llm', prompt: '{{nodes.a}}' },
      ],
      edges: [],
    } as any;

    // fallback to declared node order
    expect(topoSort(cyclic)).toEqual(['a', 'b']);
  });
});
