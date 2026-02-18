import type { LmMessage } from '../../common/types/llm.types';
import type { JsonValue } from '@shared/types/json.types';

export interface TemplateLoopContext {
  index?: number;
  iteration?: number;
}

export interface TemplateRenderContext {
  input?: JsonValue;
  nodes?: Record<string, JsonValue>;
  loop?: TemplateLoopContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolvePath(base: JsonValue, rest?: string): JsonValue | undefined {
  if (!rest) return base;
  const parts = rest
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);

  let cur: JsonValue = base;
  for (const p of parts) {
    if (!isRecord(cur)) return undefined;
    cur = cur[p] as JsonValue;
  }
  return cur;
}

function toTemplateText(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function renderTemplate(input: string, ctx: TemplateRenderContext): string {
  const alias = input.replace(/\{\{\s*steps\./g, '{{nodes.');

  // Loop helpers
  const loopIndexRaw = ctx.loop?.index;
  const loopIndex =
    typeof loopIndexRaw === 'number' && Number.isFinite(loopIndexRaw) ? loopIndexRaw : null;

  const loopIterationRaw = ctx.loop?.iteration;
  const loopIteration =
    typeof loopIterationRaw === 'number' && Number.isFinite(loopIterationRaw)
      ? loopIterationRaw
      : loopIndex !== null
        ? loopIndex + 1
        : null;

  const withLoopVars = alias
    .replace(/\{\{\s*(?:loop\.)?index\s*\}\}/g, () => (loopIndex === null ? '' : String(loopIndex)))
    .replace(/\{\{\s*(?:loop\.)?iteration\s*\}\}/g, () =>
      loopIteration === null ? '' : String(loopIteration),
    );

  const withInput = withLoopVars.replace(
    /\{\{\s*input(?:\.([a-zA-Z0-9_$. -]+))?\s*\}\}/g,
    (_m, rest) => {
      const base = ctx.input;
      if (base === undefined) return '';
      const cur = resolvePath(base, typeof rest === 'string' ? rest : undefined);
      return toTemplateText(cur);
    },
  );

  return withInput.replace(
    /\{\{\s*nodes\.([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9_$. -]+))?\s*\}\}/g,
    (_m, nodeId, rest) => {
      const base = ctx.nodes?.[String(nodeId)];
      if (base === undefined) return '';
      const cur = resolvePath(base, typeof rest === 'string' ? rest : undefined);
      return toTemplateText(cur);
    },
  );
}

export function safeJsonParse(
  text: string,
): { ok: true; value: JsonValue } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch (e: unknown) {
    const msg =
      isRecord(e) && typeof e['message'] === 'string' ? String(e['message']) : 'Invalid JSON';
    return { ok: false, error: msg };
  }
}

export function buildMessages(systemPrompt: string, prompt: string): LmMessage[] {
  const msgs: LmMessage[] = [];
  const sys = (systemPrompt ?? '').trim();
  if (sys) msgs.push({ role: 'system', content: sys });
  msgs.push({ role: 'user', content: prompt });
  return msgs;
}

export function portIndex(portId?: string): number | null {
  if (!portId) return null;
  // expects "in-1", "in-2", ...
  const m = /^in-(\d+)$/.exec(portId);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function toText(value: JsonValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
