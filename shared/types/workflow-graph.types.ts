import type { JsonObject } from './json';

export const WORKFLOW_NODE_LLM = 'lmstudio.llm' as const;
export const WORKFLOW_NODE_ASSET = 'workflow.asset' as const;
export const WORKFLOW_NODE_CONDITION = 'workflow.condition' as const;
export const WORKFLOW_NODE_LOOP_START = 'workflow.loopStart' as const;
export const WORKFLOW_NODE_LOOP_END = 'workflow.loopEnd' as const;
export const WORKFLOW_NODE_LOOP_LEGACY = 'workflow.loop' as const;
export const WORKFLOW_NODE_MERGE = 'workflow.merge' as const;
export const WORKFLOW_NODE_EXPORT = 'workflow.export' as const;
export const WORKFLOW_NODE_PREVIEW = 'ui.preview' as const;
export const WORKFLOW_NODE_TOOL = 'workflow.tool' as const;

export type WorkflowNodeType =
  | typeof WORKFLOW_NODE_LLM
  | typeof WORKFLOW_NODE_ASSET
  | typeof WORKFLOW_NODE_CONDITION
  | typeof WORKFLOW_NODE_LOOP_START
  | typeof WORKFLOW_NODE_LOOP_END
  | typeof WORKFLOW_NODE_LOOP_LEGACY
  | typeof WORKFLOW_NODE_MERGE
  | typeof WORKFLOW_NODE_EXPORT
  | typeof WORKFLOW_NODE_PREVIEW
  | typeof WORKFLOW_NODE_TOOL;

export type LoopMode = 'while' | 'until' | 'count';

export type WorkflowLlmConfig = {
  structuredOutput?: {
    enabled: boolean;
    strict?: boolean;
    name?: string;
    schema: JsonObject;
  };
};

export type WorkflowToolConfig = {
  name: string;
  args: JsonObject;
};

export type WorkflowMergeConfig = {
  separator?: string;
  inputCount?: number;
};

export type WorkflowExportConfig = {
  filename?: string;
};

export type WorkflowPreviewConfig = {
  maxLines?: number;
};

export type WorkflowLoopConfig = {
  mode?: LoopMode;
  conditionPrompt?: string;
  joiner?: string;
  maxIterations?: number;
  count?: number;

  /** legacy (kept for backward compatibility) */
  itemPath?: string;
  maxItems?: number;
};

export type WorkflowAssetConfig = {
  assetId?: string;
  extract?: boolean;
};

/**
 * Persisted node config format.
 *
 * This is intentionally shaped like the UI exports it, so both FE+BE can share
 * a single source of truth.
 */
export type WorkflowNodeConfig = {
  llm?: WorkflowLlmConfig;
  tool?: WorkflowToolConfig;
  merge?: WorkflowMergeConfig;
  export?: WorkflowExportConfig;
  preview?: WorkflowPreviewConfig;
  loop?: WorkflowLoopConfig;
  asset?: WorkflowAssetConfig;

  /** Escape hatch for future node types. */
  [key: string]: unknown;
};

export type WorkflowNodePosition = { x: number; y: number };
export type WorkflowNodeSize = { width: number; height: number };

export type WorkflowGraphNode = {
  id: string;
  type: WorkflowNodeType;
  profileName?: string;
  prompt?: string;
  config?: WorkflowNodeConfig | null;
  inputFrom?: string | null;
  position?: WorkflowNodePosition;

  /** Optional persisted layout data. */
  size?: WorkflowNodeSize;
  autoSize?: boolean;
  angle?: number;
  title?: string;
};

export type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  type?: string;
  data?: JsonObject;
};

export type WorkflowGraph = {
  nodes: WorkflowGraphNode[];
  edges?: WorkflowGraphEdge[];
};
