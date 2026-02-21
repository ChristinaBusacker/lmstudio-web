/**
 * Windows-style unique name generator.
 *
 * Rules:
 * - If `desired` is not taken, return it.
 * - If `desired` is taken, try `desired (1)`, `desired (2)`, ...
 * - If some indices already exist, pick the smallest free index.
 */
export function makeUniqueName(desired: string, existingNames: Iterable<string>): string {
  const base = String(desired ?? '').trim();
  if (!base) return base;

  const existing = new Set(
    Array.from(existingNames)
      .map((n) => String(n ?? '').trim())
      .filter(Boolean),
  );

  if (!existing.has(base)) return base;

  const escaped = escapeRegExp(base);
  const rx = new RegExp(`^${escaped}\\s\\((\\d+)\\)$`);

  const used = new Set<number>();
  used.add(0);

  for (const n of existing) {
    if (n === base) {
      used.add(0);
      continue;
    }
    const m = rx.exec(n);
    if (!m) continue;
    const idx = Number.parseInt(m[1], 10);
    if (Number.isFinite(idx) && idx > 0) used.add(idx);
  }

  let i = 1;
  while (used.has(i)) i++;
  return `${base} (${i})`;
}

function escapeRegExp(input: string): string {
  // eslint-disable-next-line no-useless-escape
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
