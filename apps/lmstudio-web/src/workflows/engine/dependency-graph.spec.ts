import { buildDependencies, topoSort } from './dependency-graph';
import type { WorkflowGraph } from './graph-types';

function graph(partial: Partial<WorkflowGraph>): WorkflowGraph {
  return {
    nodes: [],
    edges: [],
    ...(partial as WorkflowGraph),
  };
}

describe('dependency-graph', () => {
  it('builds deps from edges and template refs', () => {
    const g = graph({
      nodes: [
        { id: 'a', type: 'workflow.llm', prompt: 'A', config: {} },
        { id: 'b', type: 'workflow.llm', prompt: 'B uses {{nodes.a}}', config: {} },
        { id: 'c', type: 'workflow.llm', prompt: 'C', config: {} },
      ],
      edges: [{ id: 'e1', source: 'b', target: 'c' }],
    });

    const { deps } = buildDependencies(g);

    expect(Array.from(deps.get('b') ?? [])).toEqual(['a']);
    expect(Array.from(deps.get('c') ?? [])).toEqual(['b']);
    expect(Array.from(deps.get('a') ?? [])).toEqual([]);
  });

  it('topoSort orders by dependencies', () => {
    const g = graph({
      nodes: [
        { id: 'a', type: 'workflow.llm', prompt: 'A', config: {} },
        { id: 'b', type: 'workflow.llm', prompt: 'B uses {{nodes.a}}', config: {} },
        { id: 'c', type: 'workflow.llm', prompt: 'C uses {{nodes.b}}', config: {} },
      ],
    });

    expect(topoSort(g)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to declared order on cycles', () => {
    const g = graph({
      nodes: [
        { id: 'a', type: 'workflow.llm', prompt: 'A uses {{nodes.b}}', config: {} },
        { id: 'b', type: 'workflow.llm', prompt: 'B uses {{nodes.a}}', config: {} },
        { id: 'c', type: 'workflow.llm', prompt: 'C', config: {} },
      ],
    });

    // cycle between a and b -> should return original node order
    expect(topoSort(g)).toEqual(['a', 'b', 'c']);
  });
});
