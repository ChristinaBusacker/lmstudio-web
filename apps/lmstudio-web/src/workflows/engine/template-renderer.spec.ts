import { renderTemplate, safeJsonParse, toPrettyText } from './template-renderer';

describe('template-renderer', () => {
  it('renders input and nodes placeholders, supports steps alias', () => {
    const ctx = {
      nodes: {
        a: { value: 'Hello' },
      },
      input: { user: { name: 'Christina' } },
      loop: null,
    };

    const out = renderTemplate(
      'Hi {{input.user.name}}. From {{nodes.a.value}} and {{steps.a.value}}',
      ctx,
    );

    expect(out).toBe('Hi Christina. From Hello and Hello');
  });

  it('renders loop vars index/iteration', () => {
    const ctx = {
      nodes: {},
      input: {},
      loop: { index: 0, iteration: 1 },
    };

    expect(renderTemplate('i={{index}}, it={{iteration}}', ctx)).toBe('i=0, it=1');
    expect(renderTemplate('i={{loop.index}}, it={{loop.iteration}}', ctx)).toBe('i=0, it=1');
  });

  it('keeps unknown shortcut placeholders if not in deps', () => {
    const ctx = {
      nodes: { a: { x: 1 } },
      input: {},
      loop: null,
      __depsForRender: new Set(['b']),
    };

    expect(renderTemplate('Value {{a.x}}', ctx)).toBe('Value {{a.x}}');
  });

  it('renders shortcut placeholders for direct deps only', () => {
    const ctx = {
      nodes: { a: { x: 1 } },
      input: {},
      loop: null,
      __depsForRender: new Set(['a']),
    };

    expect(renderTemplate('Value {{a.x}}', ctx)).toBe('Value 1');
  });

  it('safeJsonParse returns ok/error and toPrettyText formats json', () => {
    const ok = safeJsonParse('{"a":1}');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value).toEqual({ a: 1 });

    const bad = safeJsonParse('{"a":');
    expect(bad.ok).toBe(false);

    expect(toPrettyText({ a: 1 })).toContain('"a"');
  });
});
