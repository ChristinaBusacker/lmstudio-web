/* eslint-disable @typescript-eslint/no-unsafe-member-access */
export type SettingsParams = {
  systemPrompt?: string;
  modelKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  [k: string]: any;
};

const CORE_KEYS = new Set(['systemPrompt', 'modelKey', 'temperature', 'maxTokens', 'topP']);

export function createDefaultParams(): SettingsParams {
  return {
    systemPrompt: '',
    modelKey: '',
    temperature: 0.7,
    maxTokens: 800,
    topP: 0.9,
  };
}

export function normalizeParams(raw: any): SettingsParams {
  const merged: SettingsParams = { ...createDefaultParams(), ...(raw ?? {}) };

  merged.temperature = clampNumber(merged.temperature, 0, 2, 0.7);
  merged.topP = clampNumber(merged.topP, 0, 1, 0.9);
  merged.maxTokens = intOrDefault(merged.maxTokens, 800);

  merged.systemPrompt = (merged.systemPrompt ?? '').toString();
  merged.modelKey = (merged.modelKey ?? '').toString();

  return merged;
}

export function extractExtras(params: SettingsParams): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (!CORE_KEYS.has(k)) out[k] = v;
  }
  return out;
}

export function prettyJson(x: any): string {
  try {
    return JSON.stringify(x ?? {}, null, 2);
  } catch {
    return '{\n  \n}';
  }
}

export function parseJsonObject(text: string): {
  value: Record<string, any> | null;
  error: string | null;
} {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { value: {}, error: null };

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err: any) {
    return { value: null, error: `JSON parse error: ${err?.message ?? 'invalid JSON'}` };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { value: null, error: 'Advanced params must be a JSON object.' };
  }

  return { value: parsed as Record<string, any>, error: null };
}

export function mergeForSave(
  baseParams: SettingsParams,
  showAdvanced: boolean,
  advancedJson: string,
) {
  if (!showAdvanced) return { params: baseParams, error: null as string | null };

  const parsed = parseJsonObject(advancedJson);
  if (!parsed.value) return { params: null as SettingsParams | null, error: parsed.error };

  // Prevent advanced JSON from overwriting core keys.
  const safeExtras: Record<string, any> = {};
  for (const [k, v] of Object.entries(parsed.value)) {
    if (!CORE_KEYS.has(k)) safeExtras[k] = v;
  }

  return { params: { ...baseParams, ...safeExtras }, error: null as string | null };
}

function clampNumber(v: any, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function intOrDefault(v: any, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}
