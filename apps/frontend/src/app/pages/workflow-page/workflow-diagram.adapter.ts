/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Workflow } from '@frontend/src/app/core/state/workflows/workflow.models';

export const NODE_LLM = 'lmstudio.llm';
export const NODE_CONDITION = 'workflow.condition';
// Structural loop nodes (loop body is everything between start and end)
export const NODE_LOOP_START = 'workflow.loopStart';
export const NODE_LOOP_END = 'workflow.loopEnd';

// Legacy loop node (kept for backward compatibility)
export const NODE_LOOP = 'workflow.loop';
export const NODE_MERGE = 'workflow.merge';
export const NODE_EXPORT = 'workflow.export';
export const NODE_PREVIEW = 'ui.preview';

export const CONDITION_TRUE_PORT = 'cond-true';
export const CONDITION_FALSE_PORT = 'cond-false';

export type WorkflowGraph = {
  nodes: Array<{
    id: string;
    type: string;
    profileName?: string;
    prompt?: string;
    config?: any;
    position?: { x: number; y: number };

    /**
     * ngDiagram layout properties (optional).
     *
     * - size/autoSize are controlled by the resize adornment and allow persisting manual dimensions.
     * - angle is controlled by the rotation adornment and allows persisting rotated nodes (e.g. diamonds).
     *
     * These fields are intentionally optional to remain backward compatible with existing graphs.
     */
    size?: { width: number; height: number };
    autoSize?: boolean;
    angle?: number;

    // legacy only (read-only for migration)
    inputFrom?: string | null;
  }>;

  edges?: Array<{
    id: string;
    source: string;
    target: string;

    sourcePort?: string;
    targetPort?: string;
    type?: string;
    data?: any;

    [key: string]: any;
  }>;
};

export type DiagramNodeData = {
  label: string;
  nodeType: string;
  profileName: string;
  prompt: string;

  mergeSeparator?: string;
  mergeInputCount?: number;

  exportFilename?: string;
  // Legacy loop fields
  loopItemPath?: string;
  loopJoiner?: string;
  loopMaxItems?: number;

  // Structural loopStart fields
  loopMaxIterations?: number;
  loopMode?: 'while' | 'until';
  loopConditionPrompt?: string;
  previewMaxLines?: number;
};

export const WORKFLOW_NODE_TEMPLATE = 'workflowNode';
export const DEFAULT_SOURCE_PORT = 'port-right';
export const DEFAULT_TARGET_PORT = 'port-left';

export const MERGE_OUT_PORT = 'out';
export const MERGE_IN_PREFIX = 'in-';

type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  type?: string;
  data?: any;
  [key: string]: any;
};

function sortById<T extends { id: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeNodes(input: any): WorkflowGraph['nodes'] {
  const spacingX = 340;
  const spacingY = 140;

  const raw: any[] = Array.isArray(input?.nodes) ? input.nodes : [];

  return raw
    .filter((n) => !!n?.id)
    .map((n, idx) => {
      const size =
        n?.size && typeof n.size === 'object'
          ? {
              width: Number(n.size.width ?? NaN),
              height: Number(n.size.height ?? NaN),
            }
          : undefined;

      const normalizedSize =
        size && Number.isFinite(size.width) && Number.isFinite(size.height) ? size : undefined;

      const angle =
        n?.angle === null || n?.angle === undefined ? undefined : Number(n.angle ?? NaN);

      const normalizedAngle = Number.isFinite(angle as number) ? (angle as number) : undefined;

      const autoSize =
        n?.autoSize === null || n?.autoSize === undefined ? undefined : Boolean(n.autoSize);

      return {
        id: String(n.id),
        type: String(n.type ?? NODE_LLM),
        profileName: String(n.profileName ?? ''),
        prompt: String(n.prompt ?? ''),
        config: n.config ?? null,
        inputFrom:
          n.inputFrom === undefined ? null : n.inputFrom === null ? null : String(n.inputFrom),
        position: n.position
          ? { x: Number(n.position.x ?? 0), y: Number(n.position.y ?? 0) }
          : { x: 40 + (idx % 2) * spacingX, y: 40 + Math.floor(idx / 2) * spacingY },

        size: normalizedSize,
        autoSize,
        angle: normalizedAngle,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeEdgesPreserveAll(input: any, nodeIds: Set<string>): DiagramEdge[] {
  const raw: any[] = Array.isArray(input?.edges) ? input.edges : [];
  const out: DiagramEdge[] = [];

  for (const e of raw) {
    const source = String(e?.source ?? '').trim();
    const target = String(e?.target ?? '').trim();
    if (!source || !target) continue;
    if (source === target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;

    out.push({
      ...e,
      id: String(e?.id ?? `${source}->${target}`),
      source,
      target,
      sourcePort: e?.sourcePort ? String(e.sourcePort) : undefined,
      targetPort: e?.targetPort ? String(e.targetPort) : undefined,
      type: e?.type ? String(e.type) : undefined,
      data: e?.data ?? {},
    });
  }

  const seen = new Set<string>();
  const deduped: DiagramEdge[] = [];
  for (const e of out) {
    const k = `${e.source}->${e.target}|${e.sourcePort ?? ''}|${e.targetPort ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }

  return sortById(deduped);
}

function deriveEdgesFromLegacyInputFrom(nodes: WorkflowGraph['nodes']): DiagramEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const out: DiagramEdge[] = [];

  for (const n of nodes) {
    const from = (n.inputFrom ?? '').trim();
    if (!from) continue;
    if (!ids.has(from)) continue;
    if (from === n.id) continue;

    out.push({
      id: `${from}->${n.id}`,
      source: from,
      target: n.id,
      sourcePort: DEFAULT_SOURCE_PORT,
      targetPort: DEFAULT_TARGET_PORT,
      data: {},
    });
  }

  return sortById(out);
}

export function normalizeWorkflowGraph(input: any): WorkflowGraph {
  const nodes = normalizeNodes(input);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const persistedEdges = normalizeEdgesPreserveAll(input, nodeIds);
  const edges = persistedEdges.length ? persistedEdges : deriveEdgesFromLegacyInputFrom(nodes);

  return { nodes, edges };
}

function nodeDefaultsByType(nodeType: string): Partial<DiagramNodeData> {
  if (nodeType === NODE_LOOP_START) {
    return {
      loopMode: 'until',
      loopConditionPrompt: 'Are we done?',
      loopJoiner: '\n\n',
      loopMaxIterations: 10,
    };
  }

  // Legacy loop defaults
  if (nodeType === NODE_LOOP) {
    return {
      loopItemPath: '',
      loopJoiner: '\n\n',
      loopMaxItems: 50,
    };
  }
  if (nodeType === NODE_MERGE) {
    return {
      mergeSeparator: '\n\n',
      mergeInputCount: 1,
    };
  }
  if (nodeType === NODE_EXPORT) {
    return {
      exportFilename: 'export.txt',
    };
  }
  if (nodeType === NODE_PREVIEW) {
    return {
      previewMaxLines: 10,
    };
  }
  return {};
}

export function workflowToDiagramModel(workflow: Workflow) {
  const graph = normalizeWorkflowGraph(workflow.graph);

  return {
    nodes: graph.nodes.map((n) => {
      const cfg = n.config ?? {};
      const defaults = nodeDefaultsByType(n.type);

      return {
        id: n.id,
        position: n.position!,
        // Persisted layout properties (optional).
        size: n.size ?? undefined,
        autoSize: n.autoSize ?? undefined,
        angle: n.angle ?? undefined,

        type: WORKFLOW_NODE_TEMPLATE,
        data: {
          label: n.id,
          nodeType: n.type,
          profileName: n.profileName ?? '',
          prompt: n.prompt ?? '',

          mergeSeparator: cfg?.merge?.separator ?? defaults.mergeSeparator,
          mergeInputCount: cfg?.merge?.inputCount ?? defaults.mergeInputCount,

          exportFilename: cfg?.export?.filename ?? defaults.exportFilename,
          // LoopStart
          loopMode: cfg?.loop?.mode ?? defaults.loopMode,
          loopConditionPrompt: cfg?.loop?.conditionPrompt ?? defaults.loopConditionPrompt,
          loopJoiner: cfg?.loop?.joiner ?? defaults.loopJoiner,
          loopMaxIterations:
            cfg?.loop?.maxIterations ?? cfg?.loop?.maxItems ?? defaults.loopMaxIterations,

          // Legacy loop
          loopItemPath: cfg?.loop?.itemPath ?? defaults.loopItemPath,
          loopMaxItems: cfg?.loop?.maxItems ?? defaults.loopMaxItems,

          previewMaxLines: cfg?.preview?.maxLines ?? defaults.previewMaxLines,
        } satisfies DiagramNodeData,
      };
    }),

    edges: (graph.edges ?? []).map((e) => ({
      ...e,
      id: String(e.id ?? `${e.source}->${e.target}`),
      source: e.source,
      target: e.target,
      sourcePort: e.sourcePort ?? DEFAULT_SOURCE_PORT,
      targetPort: e.targetPort ?? DEFAULT_TARGET_PORT,
      type: e.type ?? undefined,
      data: e.data ?? {},
    })),
  };
}

/**
 * Diagram JSON -> Persisted Graph
 */
export function diagramJsonToWorkflowGraph(diagramJson: string): WorkflowGraph {
  const json = JSON.parse(diagramJson);

  const nodes = Array.isArray(json?.nodes) ? json.nodes : [];
  const edges = Array.isArray(json?.edges) ? json.edges : [];

  return normalizeWorkflowGraph({
    nodes: nodes.map((n: any) => {
      const nodeType = String(n.data?.nodeType ?? NODE_LLM);

      const config: any = {};

      if (nodeType === NODE_MERGE) {
        config.merge = {
          separator: String(n.data?.mergeSeparator ?? '\n\n'),
          inputCount: Number(n.data?.mergeInputCount ?? 1),
        };
      }

      if (nodeType === NODE_EXPORT) {
        config.export = {
          filename: String(n.data?.exportFilename ?? 'export.txt'),
        };
      }

      if (nodeType === NODE_PREVIEW) {
        config.preview = {
          maxLines: Number(n.data?.previewMaxLines ?? 10),
        };
      }

      if (nodeType === NODE_LOOP_START) {
        config.loop = {
          mode: String(n.data?.loopMode ?? 'until'),
          conditionPrompt: String(n.data?.loopConditionPrompt ?? ''),
          joiner: String(n.data?.loopJoiner ?? '\n\n'),
          maxIterations: Number(n.data?.loopMaxIterations ?? 10),
        };
      }

      if (nodeType === NODE_LOOP) {
        // Legacy loop support
        config.loop = {
          itemPath: String(n.data?.loopItemPath ?? ''),
          joiner: String(n.data?.loopJoiner ?? '\n\n'),
          maxItems: Number(n.data?.loopMaxItems ?? 50),
        };
      }

      const size =
        n?.size && typeof n.size === 'object'
          ? {
              width: Number(n.size.width ?? NaN),
              height: Number(n.size.height ?? NaN),
            }
          : undefined;

      const normalizedSize =
        size && Number.isFinite(size.width) && Number.isFinite(size.height) ? size : undefined;

      const angle =
        n?.angle === null || n?.angle === undefined ? undefined : Number(n.angle ?? NaN);

      const normalizedAngle = Number.isFinite(angle as number) ? (angle as number) : undefined;

      const autoSize =
        n?.autoSize === null || n?.autoSize === undefined ? undefined : Boolean(n.autoSize);

      return {
        id: String(n.id),
        type: nodeType,
        profileName: String(n.data?.profileName ?? ''),
        prompt: String(n.data?.prompt ?? ''),
        config,
        position: n.position ? { x: Number(n.position.x), y: Number(n.position.y) } : undefined,

        size: normalizedSize,
        autoSize,
        angle: normalizedAngle,
      };
    }),
    edges: edges.map((e: any) => ({ ...e })),
  });
}
