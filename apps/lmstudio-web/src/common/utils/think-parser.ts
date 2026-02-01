export type ReasoningMode = 'content' | 'reasoning';

type ActiveBlock =
  | { kind: 'tag'; close: string }
  | { kind: 'fence'; close: string }
  | { kind: 'label'; closeLabel?: RegExp };

export interface ThinkParseState {
  mode: ReasoningMode;
  active?: ActiveBlock;
  carry: string; // keeps tail fragments across deltas
}

const TAG_BLOCKS: Array<{ open: string; close: string; mode: ReasoningMode }> = [
  // reasoning-ish
  { open: '<think>', close: '</think>', mode: 'reasoning' },
  { open: '<analysis>', close: '</analysis>', mode: 'reasoning' },
  { open: '<reasoning>', close: '</reasoning>', mode: 'reasoning' },
  { open: '<thoughts>', close: '</thoughts>', mode: 'reasoning' },

  // final-ish (some models wrap final explicitly)
  { open: '<final>', close: '</final>', mode: 'content' },
  { open: '<answer>', close: '</answer>', mode: 'content' },
];

const LABEL_OPENERS: Array<{ open: RegExp; mode: ReasoningMode; closeLabel?: RegExp }> = [
  // Reasoning starts
  {
    open: /(^|\n)\s*(reasoning|analysis|thoughts)\s*:\s*/i,
    mode: 'reasoning',
    closeLabel: /(^|\n)\s*(final|answer|response)\s*:\s*/i,
  },
  // Some models do "Final:" first; then everything after is content anyway
  { open: /(^|\n)\s*(final|answer|response)\s*:\s*/i, mode: 'content' },
];

const FENCE_OPENERS: Array<{ open: RegExp; mode: ReasoningMode }> = [
  // ```analysis ... ```
  { open: /(^|\n)```+\s*(analysis|reasoning|thoughts)\s*\n/i, mode: 'reasoning' },
  { open: /(^|\n)```+\s*(final|answer|response)\s*\n/i, mode: 'content' },

  // ~~~analysis ... ~~~
  { open: /(^|\n)~~~+\s*(analysis|reasoning|thoughts)\s*\n/i, mode: 'reasoning' },
  { open: /(^|\n)~~~+\s*(final|answer|response)\s*\n/i, mode: 'content' },
];

function findEarliest(
  haystack: string,
  needles: Array<{
    idx: number;
    len: number;
    apply: () => { mode: ReasoningMode; active?: ActiveBlock };
  }>,
) {
  let best = null as null | (typeof needles)[number];
  for (const n of needles) {
    if (n.idx === -1) continue;
    if (!best || n.idx < best.idx) best = n;
  }
  return best;
}

export function createThinkParseState(): ThinkParseState {
  return { mode: 'content', carry: '' };
}

/**
 * Streaming parser: splits delta into "contentDelta" (user-visible answer)
 * and "reasoningDelta" (hidden thoughts) based on common markers.
 */
export function parseThinkDelta(delta: string, state: ThinkParseState) {
  // Merge carry to handle split tokens across chunks
  let text = state.carry + delta;
  state.carry = '';

  let contentOut = '';
  let reasoningOut = '';

  // Keep last N chars as carry to detect split openers/closers next time
  const CARRY_N = 64;

  while (text.length > 0) {
    // If we are inside an active block, search for its closer
    if (state.active?.kind === 'tag') {
      const end = text.indexOf(state.active.close);
      if (end === -1) {
        // whole chunk belongs to current mode
        if (state.mode === 'reasoning') reasoningOut += text;
        else contentOut += text;
        text = '';
      } else {
        const part = text.slice(0, end);
        if (state.mode === 'reasoning') reasoningOut += part;
        else contentOut += part;

        text = text.slice(end + state.active.close.length);

        // after closing a tag block, default back to content
        state.active = undefined;
        state.mode = 'content';
      }
      continue;
    }

    if (state.active?.kind === 'fence') {
      const end = text.indexOf(state.active.close);
      if (end === -1) {
        if (state.mode === 'reasoning') reasoningOut += text;
        else contentOut += text;
        text = '';
      } else {
        const part = text.slice(0, end);
        if (state.mode === 'reasoning') reasoningOut += part;
        else contentOut += part;

        // consume closing fence line (up to end of line if present)
        let rest = text.slice(end);
        const m = rest.match(/^(```+|~~~+)\s*(\n|$)/);
        if (m) rest = rest.slice(m[0].length);
        else rest = rest.slice(state.active.close.length);

        text = rest;

        state.active = undefined;
        state.mode = 'content';
      }
      continue;
    }

    if (state.active?.kind === 'label' && state.mode === 'reasoning' && state.active.closeLabel) {
      const closeMatch = text.match(state.active.closeLabel);
      if (!closeMatch || closeMatch.index === undefined) {
        // no close label here, dump as reasoning
        reasoningOut += text;
        text = '';
      } else {
        const idx = closeMatch.index;
        reasoningOut += text.slice(0, idx);
        // consume the label itself (e.g. "\nFinal:")
        const consumed = closeMatch[0].length;
        text = text.slice(idx + consumed);
        state.active = undefined;
        state.mode = 'content';
      }
      continue;
    }

    // Not inside a block: find earliest opener among tags/fences/labels
    const candidates: Array<{
      idx: number;
      len: number;
      apply: () => { mode: ReasoningMode; active?: ActiveBlock };
    }> = [];

    // Tag openers
    for (const t of TAG_BLOCKS) {
      const idx = text.indexOf(t.open);
      if (idx !== -1) {
        candidates.push({
          idx,
          len: t.open.length,
          apply: () => ({ mode: t.mode, active: { kind: 'tag', close: t.close } }),
        });
      }
    }

    // Fence openers
    for (const f of FENCE_OPENERS) {
      const m = text.match(f.open);
      if (m && m.index !== undefined) {
        // Determine which fence string was used (``` or ~~~) by reading from match start
        const startIdx = m.index;
        const fencePrefix = text.slice(startIdx).startsWith('~~~') ? '~~~' : '```';
        candidates.push({
          idx: startIdx,
          len: m[0].length,
          apply: () => ({ mode: f.mode, active: { kind: 'fence', close: fencePrefix } }),
        });
      }
    }

    // Label openers
    for (const l of LABEL_OPENERS) {
      const m = text.match(l.open);
      if (m && m.index !== undefined) {
        candidates.push({
          idx: m.index,
          len: m[0].length,
          apply: () => ({
            mode: l.mode,
            active:
              l.mode === 'reasoning' ? { kind: 'label', closeLabel: l.closeLabel } : undefined,
          }),
        });
      }
    }

    const hit = findEarliest(text, candidates);

    if (!hit) {
      // No markers -> all goes to current mode (normally content)
      if (state.mode === 'reasoning') reasoningOut += text;
      else contentOut += text;
      text = '';
      break;
    }

    // Emit text before opener into current mode
    const before = text.slice(0, hit.idx);
    if (state.mode === 'reasoning') reasoningOut += before;
    else contentOut += before;

    // Consume opener and switch mode/active
    const afterOpener = text.slice(hit.idx + hit.len);
    const next = hit.apply();
    state.mode = next.mode;
    state.active = next.active;

    text = afterOpener;
  }

  // Store tail carry to catch split markers next chunk
  if (text.length > 0) {
    // Usually empty, but safe
    if (state.mode === 'reasoning') reasoningOut += text;
    else contentOut += text;
    text = '';
  }

  // We didn't keep it; so do a simpler approach: keep tail of last delta itself.
  // This isn't perfect but works well with CARRY_N and typical chunking.
  // Better: keep tail of (delta) to detect "<thi" + "nk>" split across events.
  const tail = delta.slice(Math.max(0, delta.length - CARRY_N));
  // Only keep if it plausibly contains marker fragments
  if (/[<`~:]/.test(tail)) {
    state.carry = tail;
  }

  return {
    contentDelta: contentOut,
    reasoningDelta: reasoningOut,
    state,
  };
}
