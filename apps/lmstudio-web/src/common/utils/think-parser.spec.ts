import { createThinkParseState, parseThinkDelta } from './think-parser';

describe('think-parser', () => {
  it('splits <think> blocks into reasoning vs content', () => {
    const state = createThinkParseState();
    const r = parseThinkDelta('<think>secret</think>Hello', state);
    expect(r.reasoningDelta).toBe('secret');
    expect(r.contentDelta).toBe('Hello');
  });

  it('handles split tag markers across chunks using carry', () => {
    const state = createThinkParseState();

    const r1 = parseThinkDelta('<thi', state);
    expect(r1.contentDelta).toBe('<thi');
    expect(r1.reasoningDelta).toBe('');

    const r2 = parseThinkDelta('nk>abc</think>Done', state);
    expect(r2.reasoningDelta).toContain('abc');
    expect(r2.contentDelta).toContain('Done');
  });

  it('supports fenced analysis blocks', () => {
    const state = createThinkParseState();
    const text = 'Hello\n```analysis\nsecret\n```\nWorld';
    const r = parseThinkDelta(text, state);
    expect(r.contentDelta).toContain('Hello');
    expect(r.reasoningDelta).toContain('secret');
    expect(r.contentDelta).toContain('World');
  });

  it('supports label blocks like "Reasoning: ... Final:"', () => {
    const state = createThinkParseState();
    const r = parseThinkDelta('Reasoning: hidden\nFinal: visible', state);
    expect(r.reasoningDelta).toContain('hidden');
    expect(r.contentDelta).toContain('visible');
  });
});
