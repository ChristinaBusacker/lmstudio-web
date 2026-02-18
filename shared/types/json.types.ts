/**
 * JSON-compatible primitive values
 */
export type JsonPrimitive = string | number | boolean | null | undefined;

/**
 * Any JSON-compatible value
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * JSON array
 */
export type JsonArray = Array<JsonValue>;

/**
 * JSON object with string keys
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * Convenience alias used throughout the codebase
 */
export type JsonRecord = JsonObject;
