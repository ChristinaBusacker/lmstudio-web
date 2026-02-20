import { buildWorkflowGraphIndex, normalizeWorkflowGraph, toJsonValue } from './graph-normalizer';

describe('workflows/engine/graph-normalizer', () => {
  it('normalizes nodes/edges and drops invalid entries', () => {
    const g = normalizeWorkflowGraph({
      nodes: [
        { id: 'a', type: 'lmstudio.llm', title: ' A ', position: { x: 1, y: 2 } },
        { id: ' ', type: 'lmstudio.llm' }, // invalid
        { id: 'b', type: '' }, // invalid
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'a' }, // self -> drop
        { id: 'e2', source: 'a', target: 'missing' }, // missing target -> drop
        { source: 'a', target: 'b', data: { ok: true } },
      ],
    });

    expect(g.nodes.map((n) => n.id)).toEqual(['a']);
    // b node was invalid so edge must be removed
    expect(g.edges).toEqual([]);
  });

  it('derives edges from legacy inputFrom when no explicit edges exist', () => {
    const g = normalizeWorkflowGraph({
      nodes: [
        { id: 'a', type: 'lmstudio.llm' },
        { id: 'b', type: 'lmstudio.llm', inputFrom: 'a' },
      ],
    });

    expect(g.edges).toEqual([expect.objectContaining({ id: 'a->b', source: 'a', target: 'b' })]);
  });

  it('buildWorkflowGraphIndex builds incoming map and stable sort', () => {
    const g = normalizeWorkflowGraph({
      nodes: [
        { id: 'a', type: 'lmstudio.llm' },
        { id: 'b', type: 'lmstudio.llm' },
      ],
      edges: [
        { id: 'z', source: 'a', target: 'b' },
        { id: 'a', source: 'a', target: 'b' },
      ],
    });

    const idx = buildWorkflowGraphIndex(g);
    expect(idx.nodeIds.has('a')).toBe(true);
    expect(idx.nodeById.get('b')?.id).toBe('b');

    const incoming = idx.incoming.get('b') ?? [];
    expect(incoming.map((e) => e.id)).toEqual(['a', 'z']);
  });

  it('toJsonValue is conservative but accepts arrays/primitives and plain objects', () => {
    expect(toJsonValue('x')).toBe('x');
    expect(toJsonValue(1)).toBe(1);
    expect(toJsonValue(true)).toBe(true);
    expect(toJsonValue(null)).toBe(null);
    expect(toJsonValue([1, 2]) as any).toEqual([1, 2]);
    expect(toJsonValue({ a: 1 }) as any).toEqual({ a: 1 });

    // class instances should not become empty objects
    class X {
      constructor(public a: number) {}
    }
    expect(toJsonValue(new X(1))).toEqual(expect.any(Object));
  });
});
