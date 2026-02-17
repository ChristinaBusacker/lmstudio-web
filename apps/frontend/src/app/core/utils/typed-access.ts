export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

export function getString(obj: JsonRecord, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

export function getNumber(obj: JsonRecord, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function getBoolean(obj: JsonRecord, key: string): boolean | null {
  const v = obj[key];
  return typeof v === 'boolean' ? v : null;
}

export function getArray(obj: JsonRecord, key: string): unknown[] | null {
  const v = obj[key];
  return Array.isArray(v) ? v : null;
}

export function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
