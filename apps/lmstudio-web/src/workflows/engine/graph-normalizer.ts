import type { JsonObject, JsonValue } from '@shared/types/json';
import type {
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeType,
} from './graph-types';
import { EMPTY_JSON_OBJECT } from '@shared/types/workflow-graph.types';
import { asJsonArray, asJsonObject, getString, isJsonObject } from '@shared/index';

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | undefined {
  return isJsonObject(value) ? (value as unknown as RawRecord) : undefined;
}

function normalizeNodes(input: unknown): WorkflowGraphNode[] {
  const root = asRecord(input);
  const raw = asJsonArray(root?.nodes) ?? [];

  const out: WorkflowGraphNode[] = [];
  for (const n of raw) {
    const obj = asRecord(n);
    if (!obj) continue;

    const id = getString(obj.id).trim();
    const type = getString(obj.type).trim();
    if (!id || !type) continue;

    const pos = asRecord(obj.position);
    const position =
      typeof pos?.x === 'number' && typeof pos?.y === 'number' ? { x: pos.x, y: pos.y } : undefined;

    const node: WorkflowGraphNode = {
      id,
      type: type as WorkflowNodeType,
      title: getString(obj.title).trim() || undefined,
      profileName: getString(obj.profileName).trim() || undefined,
      prompt: getString(obj.prompt) || undefined,
      inputFrom: getString(obj.inputFrom).trim() || undefined,
      config: (asJsonObject(obj.config) ?? undefined) as unknown as JsonObject | undefined,
      position,
    };
    out.push(node);
  }

  return out;
}

function normalizeEdges(input: unknown, nodeIds: Set<string>): WorkflowGraphEdge[] {
  const root = asRecord(input);
  const raw = asJsonArray(root?.edges) ?? [];

  const out: WorkflowGraphEdge[] = [];
  for (const e of raw) {
    const obj = asRecord(e);
    if (!obj) continue;

    const source = getString(obj.source).trim();
    const target = getString(obj.target).trim();
    if (!source || !target) continue;
    if (source === target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;

    const id = getString(obj.id, `${source}->${target}`);
    const edge: WorkflowGraphEdge = {
      id,
      source,
      target,
      sourcePort: getString(obj.sourcePort).trim() || undefined,
      targetPort: getString(obj.targetPort).trim() || undefined,
      type: getString(obj.type).trim() || undefined,
      data: (asJsonObject(obj.data) ?? EMPTY_JSON_OBJECT) as JsonObject,
    };
    out.push(edge);
  }

  return out;
}

// Back-compat for old graphs that only have `inputFrom` on nodes.
function deriveEdgesFromLegacyInputFrom(nodes: WorkflowGraphNode[]): WorkflowGraphEdge[] {
  const out: WorkflowGraphEdge[] = [];
  for (const n of nodes) {
    if (!n.inputFrom) continue;
    const src = String(n.inputFrom).trim();
    if (!src || src === n.id) continue;
    out.push({
      id: `${src}->${n.id}`,
      source: src,
      target: n.id,
      data: EMPTY_JSON_OBJECT,
    });
  }
  return out;
}

export function normalizeWorkflowGraph(input: unknown): WorkflowGraph {
  const nodes = normalizeNodes(input);
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges = normalizeEdges(input, nodeIds);
  const finalEdges = edges.length ? edges : deriveEdgesFromLegacyInputFrom(nodes);

  return { nodes, edges: finalEdges };
}

export interface WorkflowGraphIndex {
  nodeById: Map<string, WorkflowGraphNode>;
  incoming: Map<string, WorkflowGraphEdge[]>;
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

export function buildWorkflowGraphIndex(graph: WorkflowGraph): WorkflowGraphIndex {
  const nodeById = new Map<string, WorkflowGraphNode>();
  const nodeIds = new Set<string>();
  for (const n of graph.nodes) {
    nodeById.set(n.id, n);
    nodeIds.add(n.id);
  }

  const incoming = new Map<string, WorkflowGraphEdge[]>();
  const edgeIds = new Set<string>();
  for (const e of graph.edges) {
    edgeIds.add(e.id);
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e);
  }
  for (const arr of incoming.values()) arr.sort((a, b) => a.id.localeCompare(b.id));

  return { nodeById, incoming, nodeIds, edgeIds };
}

export function toJsonObject(value: unknown): JsonObject | undefined {
  const obj = asJsonObject(value);
  return obj ? (obj as JsonObject) : undefined;
}

export function toJsonValue(value: unknown): JsonValue | undefined {
  // We keep this intentionally conservative. If callers want to accept arrays/primitives,
  // they can pass them through as-is after validation.
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (Array.isArray(value)) return value as unknown as JsonValue;
  const obj = asJsonObject(value);
  return obj as unknown as JsonValue | undefined;
}
