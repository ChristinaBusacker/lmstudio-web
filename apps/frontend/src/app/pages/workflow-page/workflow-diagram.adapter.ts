/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Workflow } from '@frontend/src/app/core/state/workflows/workflow.models';

export const NODE_LLM = 'lmstudio.llm';
export const NODE_CONDITION = 'workflow.condition';
export const NODE_LOOP = 'workflow.loop';
export const NODE_MERGE = 'workflow.merge';
export const NODE_EXPORT = 'workflow.export';
export const NODE_PREVIEW = 'ui.preview';

export type WorkflowGraph = {
  nodes: Array<{
    id: string;
    type: string;
    profileName?: string;
    prompt?: string;
    config?: any;
    position?: { x: number; y: number };

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
    .map((n, idx) => ({
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
    }))
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
        type: WORKFLOW_NODE_TEMPLATE,
        data: {
          label: n.id,
          nodeType: n.type,
          profileName: n.profileName ?? '',
          prompt: n.prompt ?? '',

          mergeSeparator: cfg?.merge?.separator ?? defaults.mergeSeparator,
          mergeInputCount: cfg?.merge?.inputCount ?? defaults.mergeInputCount,

          exportFilename: cfg?.export?.filename ?? defaults.exportFilename,

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

      return {
        id: String(n.id),
        type: nodeType,
        profileName: String(n.data?.profileName ?? ''),
        prompt: String(n.data?.prompt ?? ''),
        config,
        position: n.position ? { x: Number(n.position.x), y: Number(n.position.y) } : undefined,
      };
    }),
    edges: edges.map((e: any) => ({ ...e })),
  });
}
