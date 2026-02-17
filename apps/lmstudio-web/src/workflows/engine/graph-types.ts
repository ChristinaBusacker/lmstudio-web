import type { JsonObject } from './typed-access';

export interface WorkflowGraphEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
}

export interface WorkflowGraphNode {
  id: string;
  type?: string;
  title?: string;
  prompt?: string;
  inputFrom?: string;
  config?: JsonObject;

  /** Allow unknown extra fields coming from the UI. */
  [key: string]: unknown;
}

export interface WorkflowGraph {
  nodes?: unknown;
  edges?: unknown;
}

export type IncomingEdge = WorkflowGraphEdge;
