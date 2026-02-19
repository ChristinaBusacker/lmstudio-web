import { getString } from '@shared/index';

export function asStringArray(values: unknown[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const s = getString(v).trim();
    if (s) out.push(s);
  }
  return out;
}

export function compareStringIds(a: unknown, b: unknown): number {
  const as = getString(a).trim();
  const bs = getString(b).trim();
  return as.localeCompare(bs);
}
