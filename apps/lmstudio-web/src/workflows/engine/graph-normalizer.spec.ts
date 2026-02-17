import { normalizeWorkflowGraph } from './graph-normalizer';
import type { WorkflowGraph } from './graph-types';

function g(partial: Partial<WorkflowGraph>): WorkflowGraph {
  return {
    nodes: [],
    edges: [],
    ...(partial as WorkflowGraph),
  };
}

describe('normalizeWorkflowGraph', () => {
  it('normalizes nodes and filters invalid edges', () => {
    const graph = g({
      nodes: [
        { id: 'a', type: 'workflow.llm', title: 'A', prompt: 'hi', config: {} },
        { id: 'b', type: 'workflow.tool', title: 'B', prompt: '', config: {} },
        { id: '', type: 'workflow.tool' }, // invalid
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b', sourcePort: 'p1', targetPort: 'p2' },
        { id: 'e2', source: 'a', target: 'missing' }, // invalid target
        { id: 'e3', source: 'b', target: 'b' }, // self edge
      ],
    });

    const out = normalizeWorkflowGraph(graph);

    expect(out.ids).toEqual(['a', 'b']);
    expect(out.nodeIds.has('a')).toBe(true);
    expect(out.nodeIds.has('b')).toBe(true);

    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]).toEqual({
      id: 'e1',
      source: 'a',
      target: 'b',
      sourcePort: 'p1',
      targetPort: 'p2',
    });

    expect(out.incoming.get('b')).toHaveLength(1);
    expect(out.incoming.get('b')?.[0].source).toBe('a');
  });

  it('derives edges from legacy inputFrom when edges are empty', () => {
    const graph = g({
      nodes: [
        { id: 'a', type: 'workflow.llm', prompt: 'hi', config: {} },
        { id: 'b', type: 'workflow.llm', prompt: 'yo', inputFrom: 'a', config: {} },
      ],
      edges: [],
    });

    const out = normalizeWorkflowGraph(graph);

    expect(out.edges).toEqual([
      {
        id: 'a->b',
        source: 'a',
        target: 'b',
        sourcePort: 'port-right',
        targetPort: 'port-left',
      },
    ]);
  });

  it('dedupes equivalent edges stably', () => {
    const graph = g({
      nodes: [
        { id: 'a', type: 'workflow.llm', prompt: 'hi', config: {} },
        { id: 'b', type: 'workflow.llm', prompt: 'yo', config: {} },
      ],
      edges: [
        { id: '1', source: 'a', target: 'b', sourcePort: 'x', targetPort: 'y' },
        { id: '2', source: 'a', target: 'b', sourcePort: 'x', targetPort: 'y' },
      ],
    });

    const out = normalizeWorkflowGraph(graph);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0].id).toBe('1');
  });
});
