import { getNumber, getPath, getString, isJsonObject } from './typed-access';

export interface WorkflowLoopContext {
  index?: number;
  iteration?: number;
  last?: string;

  /** Allow loop implementations to stash extra fields (items/joined/etc.) */
  [key: string]: unknown;
}

export interface WorkflowRenderContext {
  nodes: Record<string, unknown>;
  input: unknown;
  loop: WorkflowLoopContext | null;

  /** Internal: dependency set for the {{nodeId.*}} shortcut. */
  __depsForRender?: Set<string>;
}

function resolveDottedPath(base: unknown, dotted: string | undefined): unknown {
  if (base === undefined || base === null) return undefined;
  if (!dotted) return base;

  const parts = String(dotted)
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);

  let cur: unknown = base;
  for (const p of parts) {
    if (!isJsonObject(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function toTemplateText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function renderTemplate(input: string, ctx: WorkflowRenderContext): string {
  const alias = String(input ?? '').replace(/\{\{\s*steps\./g, '{{nodes.');

  const loopIndex = getNumber(getPath(ctx.loop, 'index'));
  const loopIteration =
    getNumber(getPath(ctx.loop, 'iteration')) ?? (loopIndex === null ? null : loopIndex + 1);

  const withLoopVars = alias
    .replace(/\{\{\s*(?:loop\.)?index\s*\}\}/g, () => (loopIndex === null ? '' : String(loopIndex)))
    .replace(/\{\{\s*(?:loop\.)?iteration\s*\}\}/g, () =>
      loopIteration === null ? '' : String(loopIteration),
    );

  const withInput = withLoopVars.replace(
    /\{\{\s*input(?:\.([a-zA-Z0-9_$. -]+))?\s*\}\}/g,
    (_m, rest) => {
      const cur = resolveDottedPath(ctx.input, rest);
      return toTemplateText(cur);
    },
  );

  const withNodes = withInput.replace(
    /\{\{\s*nodes\.([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9_$. -]+))?\s*\}\}/g,
    (_m, nodeId, rest) => {
      const base = ctx.nodes?.[String(nodeId)];
      const cur = resolveDottedPath(base, rest);
      return toTemplateText(cur);
    },
  );

  const deps: Set<string> | null = ctx.__depsForRender instanceof Set ? ctx.__depsForRender : null;

  // Shortcut: {{nodeId.prop}} for *direct dependencies only* (prevents accidental global access).
  return withNodes.replace(
    /\{\{\s*([a-zA-Z0-9_-]+)(?:\.([a-zA-Z0-9_$. -]+))?\s*\}\}/g,
    (m, nodeId, rest) => {
      // Don't touch known namespaces
      if (nodeId === 'nodes' || nodeId === 'steps' || nodeId === 'input' || nodeId === 'loop')
        return m;
      if (!deps || !deps.has(String(nodeId))) return m;

      const base = ctx.nodes?.[String(nodeId)];
      const cur = resolveDottedPath(base, rest);
      return toTemplateText(cur);
    },
  );
}

export function toPrettyText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export function safeJsonParse(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const msg = isJsonObject(e) ? getString(e.message, 'Invalid JSON') : 'Invalid JSON';
    return { ok: false, error: msg };
  }
}
