import { renderTemplate, safeJsonParse, toPrettyText } from './template-renderer';

describe('workflows/engine/template-renderer', () => {
  it('renders input/nodes paths with dot + bracket indexing', () => {
    const ctx = {
      nodes: {
        a: { results: [{ url: 'u1' }, { url: 'u2' }] },
      },
      input: { q: 'hello', results: [{ title: 't1' }] },
      loop: null,
    } as any;

    expect(renderTemplate('Q={{input.q}}', ctx)).toBe('Q=hello');
    expect(renderTemplate('{{nodes.a.results[1].url}}', ctx)).toBe('u2');
    expect(renderTemplate('{{input.results[0].title}}', ctx)).toBe('t1');
    expect(renderTemplate('{{input.results.0.title}}', ctx)).toBe('t1');
  });

  it('supports loop vars (incl. bracket tokens) and steps alias', () => {
    const ctx = {
      nodes: { a: { results: ['x', 'y', 'z'] } },
      input: null,
      loop: { index: 1, iteration: 2 },
    } as any;

    expect(renderTemplate('i={{loop.index}} it={{iteration}}', ctx)).toBe('i=1 it=2');
    expect(renderTemplate('{{steps.a.results[loop.index]}}', ctx)).toBe('y');
  });

  it('allows {{nodeId.path}} shortcut only for direct deps', () => {
    const ctx = {
      nodes: { a: { text: 'A' }, b: { text: 'B' } },
      input: null,
      loop: null,
      __depsForRender: new Set(['a']),
    } as any;

    expect(renderTemplate('{{a.text}}', ctx)).toBe('A');
    // b not in deps -> untouched
    expect(renderTemplate('{{b.text}}', ctx)).toBe('{{b.text}}');
  });

  it('safeJsonParse returns friendly errors', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    const bad = safeJsonParse('{');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(typeof bad.error).toBe('string');
  });

  it('toPrettyText formats objects and passes strings through', () => {
    expect(toPrettyText('x')).toBe('x');
    expect(toPrettyText({ a: 1 })).toContain('\n');
  });
});
