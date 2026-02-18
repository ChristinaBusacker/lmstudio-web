import type { JsonObject } from '@shared/index';

export type { JsonObject };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
