import { getNumber, getPath, getString, isJsonObject } from '@shared/index';

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

/**
 * Resolves a dotted path (and supports bracket array indexing).
 *
 * Examples:
 * - "a.b.c"
 * - "results[0].url"
 * - "results.0.url"
 */
function resolveDottedPath(base: unknown, dotted: string | undefined): unknown {
  if (base === undefined || base === null) return undefined;
  if (!dotted) return base;

  // Convert bracket indexing to dot indexing: results[1].url -> results.1.url
  const normalized = String(dotted).replace(/\[(\d+)\]/g, '.$1');

  const parts = normalized
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);

  let cur: unknown = base;

  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined;

    // Array index segment
    if (Array.isArray(cur)) {
      const idx = Number(p);
      if (!Number.isInteger(idx)) return undefined;
      cur = cur[idx];
      continue;
    }

    // Object key segment
    if (!isJsonObject(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }

  return cur;
}

function toTemplateText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Template syntax supported:
 * - {{input}} / {{input.path}} / {{input.results[0].url}}
 * - {{nodes.nodeId}} / {{nodes.nodeId.path}} / {{nodes.nodeId.results[0].url}}
 * - Shortcut {{nodeId.path}} only for direct deps in ctx.__depsForRender
 * - Loop vars: {{loop.index}}, {{loop.iteration}}, and shorthands {{index}}, {{iteration}}
 *
 * Loop vars are replaced BEFORE resolving paths. That means:
 * - {{nodes.search.results[loop.index].url}} works
 * - {{nodes.search.results[loop.iteration].url}} works
 */
export function renderTemplate(input: string, ctx: WorkflowRenderContext): string {
  const alias = String(input ?? '').replace(/\{\{\s*steps\./g, '{{nodes.');

  const loopIndex = getNumber(getPath(ctx.loop, 'index'));
  const loopIteration =
    getNumber(getPath(ctx.loop, 'iteration')) ?? (loopIndex === null ? null : loopIndex + 1);

  // Replace simple loop variables first (both {{loop.x}} and {{x}})
  const withLoopVars = alias
    .replace(/\{\{\s*(?:loop\.)?index\s*\}\}/g, () => (loopIndex === null ? '' : String(loopIndex)))
    .replace(/\{\{\s*(?:loop\.)?iteration\s*\}\}/g, () =>
      loopIteration === null ? '' : String(loopIteration),
    );

  /**
   * Important:
   * We also want bracket usage like results[loop.index] to work.
   * Since we already replaced {{loop.index}} and {{loop.iteration}}, we now replace
   * the literal tokens "loop.index" and "loop.iteration" when they appear inside brackets.
   *
   * Example:
   *   "{{nodes.a.results[loop.index].url}}" -> "{{nodes.a.results[0].url}}"
   */
  const withLoopVarsInBrackets = withLoopVars
    .replace(/\[loop\.index\]/g, () => (loopIndex === null ? '[]' : `[${loopIndex}]`))
    .replace(/\[loop\.iteration\]/g, () => (loopIteration === null ? '[]' : `[${loopIteration}]`));

  // Allow path characters: letters/numbers/_/$/./space/- plus brackets []
  const PATH_REST = '([a-zA-Z0-9_$. \\-\\[\\]]+)';

  const withInput = withLoopVarsInBrackets.replace(
    new RegExp(`\\{\\{\\s*input(?:\\.${PATH_REST})?\\s*\\}\\}`, 'g'),
    (_m, rest: string | undefined) => {
      const cur = resolveDottedPath(ctx.input, rest);
      return toTemplateText(cur);
    },
  );

  const withNodes = withInput.replace(
    new RegExp(`\\{\\{\\s*nodes\\.([a-zA-Z0-9_-]+)(?:\\.${PATH_REST})?\\s*\\}\\}`, 'g'),
    (_m, nodeId: string, rest: string | undefined) => {
      const base = ctx.nodes?.[String(nodeId)];
      const cur = resolveDottedPath(base, rest);
      return toTemplateText(cur);
    },
  );

  const deps: Set<string> | null = ctx.__depsForRender instanceof Set ? ctx.__depsForRender : null;

  // Shortcut: {{nodeId.prop}} for *direct dependencies only* (prevents accidental global access).
  return withNodes.replace(
    new RegExp(`\\{\\{\\s*([a-zA-Z0-9_-]+)(?:\\.${PATH_REST})?\\s*\\}\\}`, 'g'),
    (m: string, nodeId: string, rest: string | undefined) => {
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
    const msg = isJsonObject(e)
      ? getString((e as Record<string, unknown>).message, 'Invalid JSON')
      : 'Invalid JSON';
    return { ok: false, error: msg };
  }
}
