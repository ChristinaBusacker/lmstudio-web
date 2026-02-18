import type { JsonObject, JsonValue } from '@shared/types/json.types';

type JsonRecord = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  // We don't deep-validate here. This is a structural/shape gate.
  return true;
}

export function asJsonObject(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? (value as JsonObject) : undefined;
}

export function asJsonArray(value: unknown): JsonValue[] | undefined {
  return Array.isArray(value) ? (value as JsonValue[]) : undefined;
}

export function getString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function getNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Safe path getter.
 *
 * Supports dot paths like "a.b.c".
 */
export function getPath(root: unknown, path: string): unknown {
  if (!path) return root;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    const rec = cur as JsonRecord;
    cur = rec[p];
  }
  return cur;
}
