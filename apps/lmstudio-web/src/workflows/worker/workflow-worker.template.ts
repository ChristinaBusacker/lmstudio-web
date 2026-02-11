import type { LmMessage } from '../../common/types/llm.types';

export function renderTemplate(input: string, ctx: any): string {
  const alias = input.replace(/\{\{\s*steps\./g, '{{nodes.');

  // Loop helpers
  const loopIndex = Number.isFinite(Number(ctx?.loop?.index)) ? Number(ctx.loop.index) : null;
  const loopIteration = Number.isFinite(Number(ctx?.loop?.iteration))
    ? Number(ctx.loop.iteration)
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
      const base = ctx?.input;
      if (base === undefined || base === null) return '';
      if (!rest) return typeof base === 'string' ? base : JSON.stringify(base);
      const parts = String(rest)
        .split('.')
        .map((s) => s.trim())
        .filter(Boolean);
      let cur: any = base;
      for (const p of parts) {
        if (!cur || typeof cur !== 'object') return '';
        cur = cur[p];
      }
      if (cur === undefined || cur === null) return '';
      if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean') return String(cur);
      return JSON.stringify(cur);
    },
  );

  return withInput.replace(
    /\{\{\s*nodes\.([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9_$. -]+))?\s*\}\}/g,
    (_m, nodeId, rest) => {
      const base = ctx?.nodes?.[nodeId];
      if (!base) return '';
      if (!rest) return typeof base === 'string' ? base : JSON.stringify(base);
      const parts = String(rest)
        .split('.')
        .map((s) => s.trim())
        .filter(Boolean);
      let cur: any = base;
      for (const p of parts) {
        if (!cur || typeof cur !== 'object') return '';
        cur = cur[p];
      }
      if (cur === undefined || cur === null) return '';
      if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean') return String(cur);
      return JSON.stringify(cur);
    },
  );
}

export function safeJsonParse(text: string) {
  try {
    return { ok: true as const, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false as const, error: e?.message ? String(e.message) : 'Invalid JSON' };
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

export function toText(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
