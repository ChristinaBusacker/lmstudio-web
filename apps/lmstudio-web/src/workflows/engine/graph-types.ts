import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from '@shared/index';

export type { WorkflowGraph, WorkflowGraphEdge, WorkflowGraphNode };

/**
 * Incoming edges are stored by target node id.
 * Currently identical to WorkflowGraphEdge (kept as alias for readability).
 */
export type IncomingEdge = WorkflowGraphEdge;
