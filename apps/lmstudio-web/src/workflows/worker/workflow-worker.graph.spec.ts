import { buildDependencies, topoSort } from './workflow-worker.graph';

describe('workflows/worker/workflow-worker.graph', () => {
  it('normalizes edges (drops invalid) and derives deps from edges + template refs', () => {
    const g = {
      nodes: [
        { id: 'a' },
        { id: 'b', prompt: 'use {{nodes.a.text}}' },
        { id: 'c', prompt: 'also {{steps.b}}' },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'c' },
        { id: 'bad', source: 'a', target: 'missing' },
        { id: 'self', source: 'a', target: 'a' },
      ],
    };

    const { deps, incoming } = buildDependencies(g);
    expect(Array.from(deps.get('b') ?? [])).toEqual(['a']);
    expect(Array.from(deps.get('c') ?? []).sort()).toEqual(['a', 'b']);

    expect((incoming.get('c') ?? []).map((e) => e.id)).toEqual(['e1']);
  });

  it('derives edges from legacy inputFrom when edges missing', () => {
    const g = {
      nodes: [{ id: 'a' }, { id: 'b', inputFrom: 'a' }],
    };
    const { incoming } = buildDependencies(g);
    expect(incoming.get('b')?.[0]).toEqual(
      expect.objectContaining({ id: 'a->b', source: 'a', target: 'b' }),
    );
  });

  it('topoSort sorts by deps and falls back on cycles', () => {
    const acyclic = {
      nodes: [{ id: 'b', prompt: '{{nodes.a}}' }, { id: 'a' }, { id: 'c', prompt: '{{nodes.b}}' }],
      edges: [],
    };
    expect(topoSort(acyclic)).toEqual(['a', 'b', 'c']);

    const cyclic = {
      nodes: [
        { id: 'a', prompt: '{{nodes.b}}' },
        { id: 'b', prompt: '{{nodes.a}}' },
      ],
      edges: [],
    };
    expect(topoSort(cyclic)).toEqual(['a', 'b']);
  });
});
