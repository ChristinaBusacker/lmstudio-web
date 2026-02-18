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
  /**
   * Known examples:
   * - 'lmstudio.llm'
   * - 'workflow.tool'
   * - 'workflow.condition'
   * - 'workflow.merge'
   * - 'workflow.export'
   * - 'ui.preview'
   * - 'workflow.asset'
   * - 'workflow.loop' (legacy)
   * - 'workflow.loopStart' | 'workflow.loopEnd' (structural)
   */
  type: WorkflowNodeType;

  /** Optional UI label. */
  title?: string;

  profileName?: string;
  prompt?: string;

  /** Node-specific configuration (JSON only). */
  config?: WorkflowNodeConfig | null;

  /** UI layout metadata. */
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  autoSize?: boolean;
  angle?: number;

  /** Legacy v1 only (read-only). */
  inputFrom?: string | null;

  /** Allow forward-compatible extra fields from UI. */
  [key: string]: JsonValue | undefined | null;
}

export type WorkflowNodeConfig =
  | WorkflowLlmConfig
  | WorkflowToolConfig
  | WorkflowExportConfig
  | WorkflowMergeConfig
  | WorkflowPreviewConfig
  | WorkflowConditionConfig
  | WorkflowAssetConfig
  | WorkflowLoopConfig
  | JsonObject;

export interface WorkflowLlmConfig extends JsonObject {
  kind?: 'llm';
  modelKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
}

export interface WorkflowToolConfig extends JsonObject {
  kind?: 'tool';
  toolName?: string;
  args?: JsonObject;
}

export interface WorkflowExportConfig extends JsonObject {
  kind?: 'export';
  filename?: string;
  mimeType?: string;
  artifactKind?: string;
}

export interface WorkflowMergeConfig extends JsonObject {
  kind?: 'merge';
  separator?: string;
}

export interface WorkflowPreviewConfig extends JsonObject {
  kind?: 'preview';
}

export interface WorkflowConditionConfig extends JsonObject {
  kind?: 'condition';
  prompt?: string;
}

export interface WorkflowAssetConfig extends JsonObject {
  kind?: 'asset';
  assetId?: string;
}

export interface WorkflowLoopConfig extends JsonObject {
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
