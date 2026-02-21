import {
  buildMessages,
  portIndex,
  renderTemplate,
  safeJsonParse,
  toText,
} from './workflow-worker.template';

describe('workflows/worker/workflow-worker.template', () => {
  it('renders input/nodes and loop vars', () => {
    const ctx = {
      input: { q: 'hi' },
      nodes: { a: { v: 1 } },
      loop: { index: 0, iteration: 1 },
    } as any;

    expect(renderTemplate('q={{input.q}}', ctx)).toBe('q=hi');
    expect(renderTemplate('{{nodes.a.v}}', ctx)).toBe('1');
    expect(renderTemplate('i={{index}} it={{loop.iteration}}', ctx)).toBe('i=0 it=1');
  });

  it('safeJsonParse returns {ok:false} on invalid json', () => {
    const bad = safeJsonParse('{');
    expect(bad.ok).toBe(false);
  });

  it('buildMessages includes system only when non-empty', () => {
    expect(buildMessages('', 'u')).toEqual([{ role: 'user', content: 'u' }]);
    expect(buildMessages('s', 'u')).toEqual([
      { role: 'system', content: 's' },
      { role: 'user', content: 'u' },
    ]);
  });

  it('portIndex parses in-N ids', () => {
    expect(portIndex('in-1')).toBe(1);
    expect(portIndex('in-0')).toBe(0);
    expect(portIndex('x')).toBe(null);
    expect(portIndex(undefined)).toBe(null);
  });

  it('toText pretty prints non-strings', () => {
    expect(toText('x' as any)).toBe('x');
    expect(toText({ a: 1 } as any)).toContain('\n');
  });
});
