import { SettingsParams } from '@shared/index';
import { toErrorMessage } from './error.util';
import { getRecord, isRecord } from './typed-access';

const CORE_KEYS = new Set([
  'systemPrompt',
  'modelKey',
  'temperature',
  'maxTokens',
  'topP',
  'toolsEnabled',
]);

export function createDefaultParams(): SettingsParams {
  return {
    systemPrompt: '',
    modelKey: '',
    temperature: 0.7,
    maxTokens: 800,
    topP: 0.9,
    toolsEnabled: true,
  };
}

export function normalizeParams(raw: unknown): SettingsParams {
  const base = createDefaultParams();
  const obj = getRecord(raw) ?? {};

  // Merge while keeping unknown extras.
  const merged: SettingsParams = { ...base, ...obj };

  merged.temperature = clampNumber(merged.temperature, 0, 2, 0.7);
  merged.topP = clampNumber(merged.topP, 0, 1, 0.9);
  merged.maxTokens = intOrDefault(merged.maxTokens, 800);

  merged.systemPrompt = String(merged.systemPrompt ?? '');
  merged.modelKey = String(merged.modelKey ?? '');

  merged.toolsEnabled = !!merged.toolsEnabled;

  return merged;
}

export function extractExtras(params: SettingsParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (!CORE_KEYS.has(k)) out[k] = v;
  }
  return out;
}

export function prettyJson(x: unknown): string {
  try {
    return JSON.stringify(x ?? {}, null, 2);
  } catch {
    return '{\n  \n}';
  }
}

export function parseJsonObject(text: string): {
  value: Record<string, unknown> | null;
  error: string | null;
} {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { value: {}, error: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { value: null, error: `JSON parse error: ${toErrorMessage(err, 'invalid JSON')}` };
  }

  if (!isRecord(parsed)) {
    return { value: null, error: 'Advanced params must be a JSON object.' };
  }

  return { value: parsed, error: null };
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
  const safeExtras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.value)) {
    if (!CORE_KEYS.has(k)) safeExtras[k] = v;
  }

  return { params: { ...baseParams, ...safeExtras }, error: null as string | null };
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function intOrDefault(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}
