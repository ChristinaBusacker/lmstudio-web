export interface ThinkParseState {
  inThink: boolean;
}

export interface ThinkParseResult {
  contentDelta: string;
  reasoningDelta: string;
  state: ThinkParseState;
}

export function parseThinkDelta(delta: string, state: ThinkParseState): ThinkParseResult {
  let rest = delta;
  let contentOut = '';
  let reasoningOut = '';

  while (rest.length > 0) {
    if (!state.inThink) {
      const start = rest.indexOf('<think>');
      if (start === -1) {
        contentOut += rest;
        rest = '';
      } else {
        contentOut += rest.slice(0, start);
        rest = rest.slice(start + '<think>'.length);
        state = { inThink: true };
      }
    } else {
      const end = rest.indexOf('</think>');
      if (end === -1) {
        reasoningOut += rest;
        rest = '';
      } else {
        reasoningOut += rest.slice(0, end);
        rest = rest.slice(end + '</think>'.length);
        state = { inThink: false };
      }
    }
  }

  return { contentDelta: contentOut, reasoningDelta: reasoningOut, state };
}
