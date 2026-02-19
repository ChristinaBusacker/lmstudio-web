import type { JsonObject, JsonValue } from './json.types';

/**
 * Known node types used by the workflow editor/engine.
 *
 * Keep this list in sync across FE + BE.
 */
export const WORKFLOW_NODE_TYPES = [
  'lmstudio.llm',
  'workflow.tool',
  'workflow.condition',
  'workflow.asset',
  'workflow.merge',
  'workflow.export',
  'ui.preview',
  'workflow.loopStart',
  'workflow.loopEnd',
  'workflow.loopBody',
  // legacy
  'workflow.loop',
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export function isWorkflowNodeType(value: unknown): value is WorkflowNodeType {
  return typeof value === 'string' && (WORKFLOW_NODE_TYPES as readonly string[]).includes(value);
}

/**
 * Persisted workflow graph shared between frontend and backend.
 *
 * Notes:
 * - `inputFrom` is legacy (v1). Do not write it anymore, but keep reading for migration.
 * - `config` is node-specific. We model the most common shapes but keep it extensible via JsonObject.
 */
export interface WorkflowGraph {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

export interface WorkflowGraphNode {
  id: string;
  type: WorkflowNodeType;

  title?: string;
  profileName?: string;
  prompt?: string;
  config?: WorkflowNodeConfig | null;

  position?: { x: number; y: number };
  size?: { width: number; height: number };
  autoSize?: boolean;
  angle?: number;

  inputFrom?: string | null;

  // 👇 explizit NUR Zusatzfelder
  [key: string]: JsonValue | undefined | null | WorkflowNodeConfig;
}

export type WorkflowNodeConfig =
  | WorkflowLlmConfig
  | WorkflowToolConfig
  | WorkflowExportConfig
  | WorkflowMergeConfig
  | WorkflowPreviewConfig
  | WorkflowConditionConfig
  | WorkflowAssetConfig
  | WorkflowLoopConfig;

export interface WorkflowLlmConfig {
  kind?: 'llm';
  modelKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
}

export interface WorkflowToolConfig {
  kind?: 'tool';
  tool: {
    name: string;
    args: JsonObject;
  };
}

export interface WorkflowExportConfig {
  kind?: 'export';
  filename?: string;
  mimeType?: string;
  artifactKind?: string;
}

export interface WorkflowMergeConfig {
  kind?: 'merge';
  separator?: string;
}

export interface WorkflowPreviewConfig {
  kind?: 'preview';
}

export interface WorkflowConditionConfig {
  kind?: 'condition';
  prompt?: string;
}

export interface WorkflowAssetConfig {
  kind?: 'asset';
  assetId?: string;
}

export interface WorkflowLoopConfig {
  kind?: 'loop';
  maxIterations?: number;
  joiner?: string;
  mode?: string;
}

export interface WorkflowGraphEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;

  /** Rendering metadata (ng-diagram stores markers/styles here). Must remain JSON-only for persistence. */
  type?: string;
  data?: JsonObject;

  /** Allow forward-compatible extra JSON fields. */
  [key: string]: JsonValue | undefined;
}

/** Typed empty JsonObject helper (avoids `{} as JsonObject` noise). */
export const EMPTY_JSON_OBJECT: JsonObject = {};
