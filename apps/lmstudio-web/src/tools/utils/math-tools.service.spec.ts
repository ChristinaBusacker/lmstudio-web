import { MathToolsService } from './math-tools.service';

describe('MathToolsService', () => {
  const svc = new MathToolsService();

  it('evaluates operator precedence and parentheses', () => {
    const r = svc.evaluate({ expression: '2 + 3 * 4' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(14);

    const r2 = svc.evaluate({ expression: '(2 + 3) * 4' });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value).toBe(20);
  });

  it('supports unary operators, exponentiation and functions', () => {
    const r = svc.evaluate({ expression: '-2 ** 3' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(-8);

    const r2 = svc.evaluate({ expression: 'min(5, 2, 9) + abs(-3)' });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value).toBe(5);
  });

  it('supports variables (case-sensitive) and constants pi/e', () => {
    const r = svc.evaluate({ expression: 'a * 2 + PI', variables: { a: 3 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valueRaw).toBeCloseTo(3 * 2 + Math.PI);
  });

  it('rounds with precision when requested', () => {
    const r = svc.evaluate({ expression: '10 / 3', precision: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(3.33);
  });

  it('returns ok=false on errors (e.g. division by zero)', () => {
    const r = svc.evaluate({ expression: '1/0' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // normalizeError returns {message, stack?, raw}
      expect(typeof (r as any).error).toBe('object');
      expect((r as any).error.message).toContain('Division by zero');
    }
  });
});
