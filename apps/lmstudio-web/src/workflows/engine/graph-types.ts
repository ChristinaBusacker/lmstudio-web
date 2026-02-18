export type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeType,
  WorkflowNodeConfig,
  WorkflowNodePosition,
  WorkflowNodeSize,
} from '@shared/types/workflow-graph.types';

/**
 * Engine-only helpers.
 */
export type IncomingEdge = {
  edgeId: string;
  fromNodeId: string;
  fromPort?: string;
};
