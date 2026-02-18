/**
 * NOTE:
 * This file historically contained a partially-typed diagram model.
 *
 * It is now the canonical persisted workflow graph model shared between
 * frontend + backend. Keep it small, predictable and boring.
 */

export type {
  WorkflowGraph as NodeDiagramModel,
  WorkflowGraphNode as NodeModelNode,
  WorkflowGraphEdge as NodeModelEdge,
  WorkflowNodeType,
  WorkflowNodeConfig,
  WorkflowNodePosition as NodePosition,
  WorkflowNodeSize as NodeSize,
} from './workflow-graph.types';
