import { normalizeError } from './error.util';

describe('normalizeError', () => {
  it('normalizes Error instances with message and stack', () => {
    const err = new Error('boom');
    const out = normalizeError(err);
    expect(out.message).toBe('boom');
    expect(out.raw).toBe(err);
    // stack is optional but usually present
    expect(out.stack === undefined || typeof out.stack === 'string').toBe(true);
  });

  it('normalizes string errors', () => {
    const out = normalizeError('nope');
    expect(out).toEqual({ message: 'nope', raw: 'nope' });
  });

  it('falls back for unknown values', () => {
    const out = normalizeError({ ok: false });
    expect(out.message).toBe('Unknown error');
    expect(out.raw).toEqual({ ok: false });
  });
});
