import type { JsonObject } from './json.types';
import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeConfig,
} from './workflow-graph.types';

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeSize {
  width: number;
  height: number;
}

/**
 * Legacy names kept for backward compatibility.
 * Prefer importing from `workflow-graph.types.ts`.
 */
export type NodeConfig = WorkflowNodeConfig;
export type NodeModelNode = WorkflowGraphNode;
export type NodeModelEdge = WorkflowGraphEdge;
export type NodeDiagramModel = WorkflowGraph;

/**
 * Narrow legacy configs that some callers still import.
 * Keep them as small helpers but make them JSON-only.
 */
export interface ToolConfig extends JsonObject {
  name: string;
  args: JsonObject;
}

export interface ExportConfig extends JsonObject {
  filename: string;
}
