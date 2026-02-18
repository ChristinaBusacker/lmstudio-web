import { Workflow } from '@frontend/src/app/core/state/workflows/workflow.models';
import {
  getArray,
  getRecord,
  isRecord,
  safeJsonParse,
  type JsonRecord,
} from '@frontend/src/app/core/utils/typed-access';

import {
  WORKFLOW_NODE_ASSET,
  WORKFLOW_NODE_CONDITION,
  WORKFLOW_NODE_EXPORT,
  WORKFLOW_NODE_LLM,
  WORKFLOW_NODE_LOOP_END,
  WORKFLOW_NODE_LOOP_LEGACY,
  WORKFLOW_NODE_LOOP_START,
  WORKFLOW_NODE_MERGE,
  WORKFLOW_NODE_PREVIEW,
  WORKFLOW_NODE_TOOL,
  type LoopMode,
  type WorkflowGraph,
  type WorkflowNodeType,
} from '@shared/types/workflow-graph.types';

export const NODE_LLM: WorkflowNodeType = WORKFLOW_NODE_LLM;
export const NODE_ASSET: WorkflowNodeType = WORKFLOW_NODE_ASSET;
export const NODE_CONDITION: WorkflowNodeType = WORKFLOW_NODE_CONDITION;
// Structural loop nodes (loop body is everything between start and end)
export const NODE_LOOP_START: WorkflowNodeType = WORKFLOW_NODE_LOOP_START;
export const NODE_LOOP_END: WorkflowNodeType = WORKFLOW_NODE_LOOP_END;

// Legacy loop node (kept for backward compatibility)
export const NODE_LOOP: WorkflowNodeType = WORKFLOW_NODE_LOOP_LEGACY;
export const NODE_MERGE: WorkflowNodeType = WORKFLOW_NODE_MERGE;
export const NODE_EXPORT: WorkflowNodeType = WORKFLOW_NODE_EXPORT;
export const NODE_PREVIEW: WorkflowNodeType = WORKFLOW_NODE_PREVIEW;
export const NODE_TOOL: WorkflowNodeType = WORKFLOW_NODE_TOOL;

export const CONDITION_TRUE_PORT = 'cond-true';
export const CONDITION_FALSE_PORT = 'cond-false';

// WorkflowGraph type moved to shared/types/workflow-graph.types.ts

export type DiagramNodeData = {
  label: string;
  nodeType: WorkflowNodeType;
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
  loopMode?: LoopMode;
  loopConditionPrompt?: string;
  loopCount?: number;
  previewMaxLines?: number;

  // Per-node LLM structured output override
  structuredOutputEnabled?: boolean;
  structuredOutputSchema?: string;

  // Tool node
  toolName?: string;
  // Generic fallback JSON (advanced)
  toolArgsJson?: string;

  // web_search
  webSearchQuery?: string;
  webSearchLimit?: number;

  // web_read
  webReadUrl?: string;

  // doc_read
  docReadAssetId?: string;

  // current_time
  currentTimeTimezone?: string;

  // resolve_relative_date
  resolveRelativeText?: string;
  resolveRelativeTimezone?: string;
  resolveRelativeBaseTime?: string;

  // date_math
  dateMathBaseTime?: string;
  dateMathOperation?: 'add' | 'startOfDay' | 'endOfDay' | 'roundToHour';
  dateMathAmount?: number;
  dateMathUnit?: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

  // math
  mathExpression?: string;
  mathPrecision?: number;

  // json tools
  jsonInput?: string;
  jsonSchema?: string;

  // Asset node
  assetId?: string;
  assetFilename?: string;
  assetMimeType?: string | null;
  assetSha256?: string;
  assetExtract?: boolean;
};

export const WORKFLOW_NODE_TEMPLATE = 'workflowNode';
export const DEFAULT_SOURCE_PORT = 'port-right';
export const DEFAULT_TARGET_PORT = 'port-left';

export const MERGE_OUT_PORT = 'out';
export const MERGE_IN_PREFIX = 'in-';

export type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  type?: string;
  data?: unknown;
  [key: string]: unknown;
};

export type DiagramModel = {
  nodes: Array<{
    id: string;
    position: { x: number; y: number };
    size?: { width: number; height: number };
    autoSize?: boolean;
    angle?: number;
    type: string;
    data: DiagramNodeData;
  }>;
  edges: DiagramEdge[];
};

function sortById<T extends { id: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function normalizeNodes(input: unknown): WorkflowGraph['nodes'] {
  const spacingX = 340;
  const spacingY = 140;

  const root = getRecord(input);
  const raw = root ? (getArray(root, 'nodes') ?? []) : [];

  return raw
    .filter((n) => isRecord(n) && typeof n.id !== 'undefined')
    .map((nUnknown, idx) => {
      const n = getRecord(nUnknown) as JsonRecord;
      const pos = getRecord(n.position);
      const sizeObj = getRecord(n.size);

      const size = sizeObj
        ? {
            width: toFiniteNumber(sizeObj.width, NaN),
            height: toFiniteNumber(sizeObj.height, NaN),
          }
        : undefined;

      const normalizedSize =
        size && Number.isFinite(size.width) && Number.isFinite(size.height) ? size : undefined;

      const angle =
        n.angle === null || n.angle === undefined ? undefined : toFiniteNumber(n.angle, NaN);

      const normalizedAngle =
        typeof angle === 'number' && Number.isFinite(angle) ? angle : undefined;

      const autoSize =
        n.autoSize === null || n.autoSize === undefined ? undefined : Boolean(n.autoSize);

      return {
        id: String(n.id),
        type: String(n.type ?? NODE_LLM) as WorkflowNodeType,
        profileName: String(n.profileName ?? ''),
        prompt: String(n.prompt ?? ''),
        config: (n.config ?? null) as WorkflowGraph['nodes'][number]['config'],
        inputFrom:
          n.inputFrom === undefined ? null : n.inputFrom === null ? null : String(n.inputFrom),
        position: pos
          ? { x: toFiniteNumber(pos.x, 0), y: toFiniteNumber(pos.y, 0) }
          : { x: 40 + (idx % 2) * spacingX, y: 40 + Math.floor(idx / 2) * spacingY },

        size: normalizedSize,
        autoSize,
        angle: normalizedAngle,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeEdgesPreserveAll(input: unknown, nodeIds: Set<string>): DiagramEdge[] {
  const root = getRecord(input);
  const raw = root ? (getArray(root, 'edges') ?? []) : [];
  const out: DiagramEdge[] = [];

  for (const e of raw) {
    const er = getRecord(e);
    if (!er) continue;

    const source = String(er.source ?? '').trim();
    const target = String(er.target ?? '').trim();
    if (!source || !target) continue;
    if (source === target) continue;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;

    out.push({
      ...er,
      id: String(er.id ?? `${source}->${target}`),
      source,
      target,
      sourcePort: er.sourcePort ? String(er.sourcePort) : undefined,
      targetPort: er.targetPort ? String(er.targetPort) : undefined,
      type: er.type ? String(er.type) : undefined,
      data: er.data ?? {},
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

export function normalizeWorkflowGraph(input: unknown): WorkflowGraph {
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
      loopCount: 3,
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

  if (nodeType === NODE_TOOL) {
    return {
      toolName: 'web_search',
      webSearchQuery: '',
      webSearchLimit: 5,
      currentTimeTimezone: 'Europe/Berlin',
      resolveRelativeTimezone: 'Europe/Berlin',
      dateMathOperation: 'add',
      dateMathAmount: 1,
      dateMathUnit: 'days',
      mathPrecision: 8,
      jsonInput: '',
      jsonSchema: '{\n  "type": "object"\n}',
    };
  }

  if (nodeType === NODE_ASSET) {
    return {
      assetId: '',
      assetExtract: true,
    };
  }

  return {};
}

export function workflowToDiagramModel(workflow: Workflow): DiagramModel {
  const graph = normalizeWorkflowGraph(workflow.graph);

  return {
    nodes: graph.nodes.map((n) => {
      const cfg = getRecord(n.config) ?? {};
      const defaults = nodeDefaultsByType(n.type);

      // ---- Tool node config -> form fields ----
      const toolCfg = getRecord(cfg.tool);
      const toolName: string = String(toolCfg?.name ?? defaults.toolName ?? 'web_search');
      const toolArgs = getRecord(toolCfg?.args) ?? {};

      const toolFields: Partial<DiagramNodeData> = {};
      if (n.type === NODE_TOOL) {
        toolFields.toolName = toolName;
        toolFields.toolArgsJson = toolArgs ? JSON.stringify(toolArgs, null, 2) : '';

        if (toolName === 'web_search') {
          toolFields.webSearchQuery = String(
            toolArgs.q ?? toolArgs.query ?? defaults.webSearchQuery ?? '',
          );
          toolFields.webSearchLimit = toFiniteNumber(
            toolArgs.limit,
            Number(defaults.webSearchLimit ?? 5),
          );
        }

        if (toolName === 'web_read') {
          toolFields.webReadUrl = String(toolArgs.url ?? defaults.webReadUrl ?? '');
        }

        if (toolName === 'doc_read') {
          toolFields.docReadAssetId = String(toolArgs.assetId ?? defaults.docReadAssetId ?? '');
        }

        if (toolName === 'current_time') {
          toolFields.currentTimeTimezone = String(
            toolArgs.timezone ?? defaults.currentTimeTimezone ?? 'Europe/Berlin',
          );
        }

        if (toolName === 'resolve_relative_date') {
          toolFields.resolveRelativeText = String(
            toolArgs.text ?? defaults.resolveRelativeText ?? '',
          );
          toolFields.resolveRelativeTimezone = String(
            toolArgs.timezone ?? defaults.resolveRelativeTimezone ?? 'Europe/Berlin',
          );
          toolFields.resolveRelativeBaseTime = toolArgs.baseTime
            ? String(toolArgs.baseTime)
            : (defaults.resolveRelativeBaseTime ?? '');
        }

        if (toolName === 'date_math') {
          toolFields.dateMathBaseTime = toolArgs.base
            ? String(toolArgs.base)
            : (defaults.dateMathBaseTime ?? '');
          // The form UI uses a simplified operation enum, but the tool supports multiple fields.
          // If multiple are present, prefer add > startOf > endOf > roundTo.
          if (toolArgs.add) toolFields.dateMathOperation = 'add';
          else if (toolArgs.startOf) toolFields.dateMathOperation = 'startOfDay';
          else if (toolArgs.endOf) toolFields.dateMathOperation = 'endOfDay';
          else if (toolArgs.roundTo) toolFields.dateMathOperation = 'roundToHour';
          else toolFields.dateMathOperation = defaults.dateMathOperation ?? 'add';

          // Flatten add into amount+unit for the UI when possible.
          const addObj = getRecord(toolArgs.add) ?? {};
          type DateUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

          const unitOrder: DateUnit[] = ['years', 'months', 'weeks', 'days', 'hours', 'minutes'];
          let pickedUnit: DateUnit = (defaults.dateMathUnit ?? 'days') as DateUnit;
          let pickedAmount: number = Number(defaults.dateMathAmount ?? 1);

          for (const u of unitOrder) {
            if (typeof addObj[u] === 'number') {
              pickedUnit = u;
              pickedAmount = Number(addObj[u]);
              break;
            }
          }
          toolFields.dateMathUnit = pickedUnit;
          toolFields.dateMathAmount = pickedAmount;
        }

        if (toolName === 'math') {
          toolFields.mathExpression = String(toolArgs.expression ?? defaults.mathExpression ?? '');
          toolFields.mathPrecision = toFiniteNumber(
            toolArgs.precision,
            Number(defaults.mathPrecision ?? 8),
          );
        }

        if (toolName === 'json_validate') {
          toolFields.jsonInput = String(toolArgs?.data ?? defaults.jsonInput ?? '');
          toolFields.jsonSchema = String(
            toolArgs?.schema ?? defaults.jsonSchema ?? '{\n  "type": "object"\n}',
          );
        }

        if (toolName === 'json_repair') {
          toolFields.jsonInput = String(toolArgs?.text ?? defaults.jsonInput ?? '');
        }
      }

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

          mergeSeparator:
            (getRecord(cfg.merge)?.separator as string | undefined) ?? defaults.mergeSeparator,
          mergeInputCount:
            (getRecord(cfg.merge)?.inputCount as number | undefined) ?? defaults.mergeInputCount,

          exportFilename:
            (getRecord(cfg.export)?.filename as string | undefined) ?? defaults.exportFilename,
          // LoopStart
          loopMode: (getRecord(cfg.loop)?.mode as DiagramNodeData['loopMode']) ?? defaults.loopMode,
          loopConditionPrompt:
            (getRecord(cfg.loop)?.conditionPrompt as string | undefined) ??
            defaults.loopConditionPrompt,
          loopJoiner: (getRecord(cfg.loop)?.joiner as string | undefined) ?? defaults.loopJoiner,
          loopMaxIterations:
            (getRecord(cfg.loop)?.maxIterations as number | undefined) ??
            (getRecord(cfg.loop)?.maxItems as number | undefined) ??
            defaults.loopMaxIterations,
          loopCount: (getRecord(cfg.loop)?.count as number | undefined) ?? defaults.loopCount,

          // Legacy loop
          loopItemPath:
            (getRecord(cfg.loop)?.itemPath as string | undefined) ?? defaults.loopItemPath,
          loopMaxItems:
            (getRecord(cfg.loop)?.maxItems as number | undefined) ?? defaults.loopMaxItems,

          previewMaxLines:
            (getRecord(cfg.preview)?.maxLines as number | undefined) ?? defaults.previewMaxLines,

          structuredOutputEnabled: Boolean(
            getRecord(getRecord(cfg.llm)?.structuredOutput)?.enabled ?? false,
          ),
          structuredOutputSchema: getRecord(getRecord(cfg.llm)?.structuredOutput)?.schema
            ? JSON.stringify(getRecord(getRecord(cfg.llm)?.structuredOutput)?.schema, null, 2)
            : '',

          assetId: (getRecord(cfg.asset)?.assetId as string | undefined) ?? '',
          assetExtract: (getRecord(cfg.asset)?.extract as boolean | undefined) ?? true,

          ...toolFields,
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
  const parsed = safeJsonParse(diagramJson);
  const json = getRecord(parsed) ?? {};

  const nodes = getArray(json, 'nodes') ?? [];
  const edges = getArray(json, 'edges') ?? [];

  return normalizeWorkflowGraph({
    nodes: nodes
      .map((n) => (isRecord(n) ? n : null))
      .filter((n): n is JsonRecord => !!n)
      .map((n) => {
        const data = getRecord(n.data) ?? {};
        const nodeType = String(data.nodeType ?? NODE_LLM);

        const config: JsonRecord = {};

        if (nodeType === NODE_LLM) {
          const enabled = Boolean(data.structuredOutputEnabled);
          const schemaText = String(data.structuredOutputSchema ?? '').trim();
          if (enabled) {
            const schema: unknown = schemaText
              ? (safeJsonParse(schemaText) ?? { type: 'object' })
              : { type: 'object' };
            (config as Record<string, unknown>).llm = {
              structuredOutput: {
                enabled: true,
                strict: true,
                name: 'node_structured_output',
                schema,
              },
            };
          }
        }

        if (nodeType === NODE_TOOL) {
          const toolName = String(data.toolName ?? 'web_search').trim() || 'web_search';

          // Prefer advanced JSON args if provided and valid.
          let toolArgs: JsonRecord = {};
          const rawArgs = String(data.toolArgsJson ?? '').trim();
          if (rawArgs) {
            toolArgs = getRecord(safeJsonParse(rawArgs)) ?? {};
          }

          // If advanced args were empty/invalid, build args from tool-specific form fields.
          if (!rawArgs || (rawArgs && Object.keys(toolArgs).length === 0)) {
            if (toolName === 'web_search') {
              toolArgs = {
                q: String(data.webSearchQuery ?? ''),
                limit: toFiniteNumber(data.webSearchLimit, 5),
              };
            } else if (toolName === 'web_read') {
              toolArgs = { url: String(data.webReadUrl ?? '') };
            } else if (toolName === 'doc_read') {
              toolArgs = { assetId: String(data.docReadAssetId ?? '') };
            } else if (toolName === 'current_time') {
              const tz = String(data.currentTimeTimezone ?? 'Europe/Berlin');
              toolArgs = tz ? { timezone: tz } : {};
            } else if (toolName === 'resolve_relative_date') {
              const text = String(data.resolveRelativeText ?? '');
              const tz = String(data.resolveRelativeTimezone ?? 'Europe/Berlin');
              const baseTime = String(data.resolveRelativeBaseTime ?? '').trim();
              toolArgs = {
                text,
                timezone: tz,
                ...(baseTime ? { baseTime } : {}),
              };
            } else if (toolName === 'date_math') {
              const base = String(data.dateMathBaseTime ?? '').trim();
              const op = String(data.dateMathOperation ?? 'add');
              const amount = toFiniteNumber(data.dateMathAmount, 1);
              const unit = String(data.dateMathUnit ?? 'days');

              const args: JsonRecord = {};
              if (base) args.base = base;

              if (op === 'add') {
                args.add = { [unit]: amount };
              } else if (op === 'startOfDay') {
                args.startOf = 'day';
              } else if (op === 'endOfDay') {
                args.endOf = 'day';
              } else if (op === 'roundToHour') {
                args.roundTo = 'hour';
              }

              toolArgs = args;
            } else if (toolName === 'math') {
              toolArgs = {
                expression: String(data.mathExpression ?? ''),
                precision: toFiniteNumber(data.mathPrecision, 8),
              };
            } else if (toolName === 'json_validate') {
              toolArgs = {
                data: String(data.jsonInput ?? ''),
                schema: String(data.jsonSchema ?? ''),
              };
            } else if (toolName === 'json_repair') {
              toolArgs = { text: String(data.jsonInput ?? '') };
            }
          }

          (config as Record<string, unknown>).tool = {
            name: toolName,
            args: toolArgs ?? {},
          };
        }

        if (nodeType === NODE_ASSET) {
          (config as Record<string, unknown>).asset = {
            assetId: String(data.assetId ?? ''),
            extract: true,
          };
        }

        if (nodeType === NODE_MERGE) {
          (config as Record<string, unknown>).merge = {
            separator: String(data.mergeSeparator ?? '\n\n'),
            inputCount: toFiniteNumber(data.mergeInputCount, 1),
          };
        }

        if (nodeType === NODE_EXPORT) {
          (config as Record<string, unknown>).export = {
            filename: String(data.exportFilename ?? 'export.txt'),
          };
        }

        if (nodeType === NODE_PREVIEW) {
          (config as Record<string, unknown>).preview = {
            maxLines: toFiniteNumber(data.previewMaxLines, 10),
          };
        }

        if (nodeType === NODE_LOOP_START) {
          (config as Record<string, unknown>).loop = {
            mode: String(data.loopMode ?? 'until'),
            conditionPrompt: String(data.loopConditionPrompt ?? ''),
            joiner: String(data.loopJoiner ?? '\n\n'),
            maxIterations: toFiniteNumber(data.loopMaxIterations, 10),
            count: toFiniteNumber(data.loopCount, 3),
          };
        }

        if (nodeType === NODE_LOOP) {
          // Legacy loop support
          (config as Record<string, unknown>).loop = {
            itemPath: String(data.loopItemPath ?? ''),
            joiner: String(data.loopJoiner ?? '\n\n'),
            maxItems: toFiniteNumber(data.loopMaxItems, 50),
          };
        }

        const sizeRaw = getRecord(n.size);
        const size = sizeRaw
          ? {
              width: toFiniteNumber(sizeRaw.width, NaN),
              height: toFiniteNumber(sizeRaw.height, NaN),
            }
          : undefined;

        const normalizedSize =
          size && Number.isFinite(size.width) && Number.isFinite(size.height) ? size : undefined;

        const angle =
          n.angle === null || n.angle === undefined ? undefined : toFiniteNumber(n.angle, NaN);

        const normalizedAngle =
          typeof angle === 'number' && Number.isFinite(angle) ? angle : undefined;

        const autoSize =
          n.autoSize === null || n.autoSize === undefined ? undefined : Boolean(n.autoSize);

        return {
          id: String(n.id),
          type: nodeType,
          profileName: String(data.profileName ?? ''),
          prompt: String(data.prompt ?? ''),
          config,
          position: isRecord(n.position)
            ? { x: toFiniteNumber(n.position.x, 0), y: toFiniteNumber(n.position.y, 0) }
            : undefined,

          size: normalizedSize,
          autoSize,
          angle: normalizedAngle,
        };
      }),
    edges: edges
      .map((e) => (isRecord(e) ? e : null))
      .filter((e): e is JsonRecord => !!e)
      .map((e) => ({ ...e })),
  });
}
