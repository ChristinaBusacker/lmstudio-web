import type { JsonObject, JsonValue } from '@shared/index';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getRecord(obj: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];
  return isRecord(v) ? v : null;
}

export function getArray(obj: unknown, key: string): unknown[] | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];
  return Array.isArray(v) ? v : null;
}

export function getString(obj: unknown, key: string): string | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

export function getNumber(obj: unknown, key: string): number | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];
  return typeof v === 'number' ? v : null;
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function toJsonObject(value: unknown): JsonObject {
  if (!isRecord(value)) return {};
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = toJsonValue(v);
  }
  return out;
}

export function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) return toJsonObject(value);
  // JSON cannot represent these; stringify to keep information.
  return String(value);
}
