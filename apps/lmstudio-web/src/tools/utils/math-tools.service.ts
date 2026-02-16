import { Injectable } from '@nestjs/common';

type EvalArgs = {
  expression: string;
  variables?: Record<string, unknown>;
  precision?: number;
};

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' };

const OPS: Record<
  string,
  { prec: number; assoc: 'L' | 'R'; args: number; fn: (...xs: number[]) => number }
> = {
  '+': { prec: 2, assoc: 'L', args: 2, fn: (a, b) => a + b },
  '-': { prec: 2, assoc: 'L', args: 2, fn: (a, b) => a - b },
  '*': { prec: 3, assoc: 'L', args: 2, fn: (a, b) => a * b },
  '/': {
    prec: 3,
    assoc: 'L',
    args: 2,
    fn: (a, b) => {
      if (b === 0) throw new Error('Division by zero');
      return a / b;
    },
  },
  '%': {
    prec: 3,
    assoc: 'L',
    args: 2,
    fn: (a, b) => {
      if (b === 0) throw new Error('Division by zero');
      return a % b;
    },
  },
  '**': { prec: 4, assoc: 'R', args: 2, fn: (a, b) => a ** b },
  'u+': { prec: 5, assoc: 'R', args: 1, fn: (a) => +a },
  'u-': { prec: 5, assoc: 'R', args: 1, fn: (a) => -a },
};

const FUNCS: Record<string, { args: number | 'var'; fn: (...xs: number[]) => number }> = {
  abs: { args: 1, fn: Math.abs },
  sqrt: { args: 1, fn: Math.sqrt },
  pow: { args: 2, fn: Math.pow },
  round: { args: 1, fn: Math.round },
  floor: { args: 1, fn: Math.floor },
  ceil: { args: 1, fn: Math.ceil },
  min: { args: 'var', fn: (...xs) => Math.min(...xs) },
  max: { args: 'var', fn: (...xs) => Math.max(...xs) },
  log: { args: 1, fn: Math.log },
  exp: { args: 1, fn: Math.exp },
  sin: { args: 1, fn: Math.sin },
  cos: { args: 1, fn: Math.cos },
  tan: { args: 1, fn: Math.tan },
};

function tokenize(expr: string): Token[] {
  const s = expr.trim();
  const out: Token[] = [];
  let i = 0;
  const isWs = (c: string) => /\s/.test(c);
  const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_]/.test(c);

  while (i < s.length) {
    const c = s[i]!;
    if (isWs(c)) {
      i += 1;
      continue;
    }

    if (c === '(') {
      out.push({ t: 'lp' });
      i += 1;
      continue;
    }

    if (c === ')') {
      out.push({ t: 'rp' });
      i += 1;
      continue;
    }

    if (c === ',') {
      out.push({ t: 'comma' });
      i += 1;
      continue;
    }

    // Operators (check ** first)
    if (c === '*' && s[i + 1] === '*') {
      out.push({ t: 'op', v: '**' });
      i += 2;
      continue;
    }

    if ('+-*/%'.includes(c)) {
      out.push({ t: 'op', v: c });
      i += 1;
      continue;
    }

    // Numbers
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j]!)) j += 1;
      const raw = s.slice(i, j);
      const v = Number(raw);
      if (!Number.isFinite(v)) throw new Error(`Invalid number: ${raw}`);
      out.push({ t: 'num', v });
      i = j;
      continue;
    }

    // Identifiers
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < s.length && isId(s[j]!)) j += 1;
      out.push({ t: 'id', v: s.slice(i, j) });
      i = j;
      continue;
    }

    throw new Error(`Unexpected character: ${c}`);
  }

  return out;
}

type RpnItem =
  | { k: 'num'; v: number }
  | { k: 'var'; v: string }
  | { k: 'op'; v: string }
  | { k: 'call'; name: string; argc: number };

function toRpn(tokens: Token[]): RpnItem[] {
  const output: RpnItem[] = [];
  const stack: Array<{ kind: 'op' | 'lp' | 'func'; v?: string; argc?: number }> = [];

  // Used to detect unary +/-. At the start or after an operator/left-paren/comma => unary.
  let prev: Token | null = null;

  const pushOp = (op: string) => {
    const o1 = OPS[op];
    if (!o1) throw new Error(`Unknown operator: ${op}`);

    while (stack.length) {
      const top = stack[stack.length - 1]!;
      if (top.kind !== 'op' || !top.v) break;
      const o2 = OPS[top.v];
      if (!o2) break;

      const cond =
        (o1.assoc === 'L' && o1.prec <= o2.prec) || (o1.assoc === 'R' && o1.prec < o2.prec);

      if (!cond) break;

      output.push({ k: 'op', v: top.v });
      stack.pop();
    }

    stack.push({ kind: 'op', v: op });
  };

  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx]!;

    if (t.t === 'num') {
      output.push({ k: 'num', v: t.v });
      prev = t;
      continue;
    }

    if (t.t === 'id') {
      // function call if next token is (
      const next = tokens[idx + 1];
      if (next?.t === 'lp' && FUNCS[t.v.toLowerCase()]) {
        stack.push({ kind: 'func', v: t.v.toLowerCase(), argc: 0 });
      } else {
        output.push({ k: 'var', v: t.v });
      }
      prev = t;
      continue;
    }

    if (t.t === 'op') {
      const isUnary =
        !prev || prev.t === 'op' || prev.t === 'lp' || prev.t === 'comma' || prev.t === 'rp';
      const op = isUnary && (t.v === '+' || t.v === '-') ? `u${t.v}` : t.v;
      pushOp(op);
      prev = t;
      continue;
    }

    if (t.t === 'comma') {
      // pop operators until left paren
      while (stack.length && stack[stack.length - 1]!.kind !== 'lp') {
        const top = stack.pop()!;
        if (top.kind === 'op' && top.v) output.push({ k: 'op', v: top.v });
        if (top.kind === 'func') {
          // shouldn't happen before ')'
          stack.push(top);
          break;
        }
      }
      // increment func argc (we count commas)
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j]!.kind === 'func') {
          stack[j]!.argc = (stack[j]!.argc ?? 0) + 1;
          break;
        }
        if (stack[j]!.kind === 'lp') break;
      }
      prev = t;
      continue;
    }

    if (t.t === 'lp') {
      stack.push({ kind: 'lp' });
      prev = t;
      continue;
    }

    if (t.t === 'rp') {
      while (stack.length && stack[stack.length - 1]!.kind !== 'lp') {
        const top = stack.pop()!;
        if (top.kind === 'op' && top.v) output.push({ k: 'op', v: top.v });
        if (top.kind === 'func') {
          // Should not be popped here.
          stack.push(top);
          break;
        }
      }
      if (!stack.length) throw new Error('Mismatched parentheses');
      stack.pop(); // pop lp

      // if on top is func, emit call
      const maybeFunc = stack[stack.length - 1];
      if (maybeFunc?.kind === 'func' && maybeFunc.v) {
        const func = stack.pop()!;
        // argc is commas + 1, unless empty args: "f()" => 0
        const prevTok = tokens[idx - 1];
        const argc = prevTok?.t === 'lp' ? 0 : (func.argc ?? 0) + 1;

        if (!func.v) {
          throw new Error('Invalid function token: missing name');
        }
        output.push({ k: 'call', name: func.v, argc });
      }

      prev = t;
      continue;
    }
  }

  while (stack.length) {
    const top = stack.pop()!;
    if (top.kind === 'lp') throw new Error('Mismatched parentheses');
    if (top.kind === 'op' && top.v) output.push({ k: 'op', v: top.v });
    if (top.kind === 'func' && top.v) output.push({ k: 'call', name: top.v, argc: top.argc ?? 0 });
  }

  return output;
}

function toNumber(x: unknown): number {
  if (typeof x === 'number') return x;
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`Variable is not a number: ${String(x)}`);
}

function evalRpn(rpn: RpnItem[], variables: Record<string, unknown>): number {
  const stack: number[] = [];

  for (const item of rpn) {
    if (item.k === 'num') {
      stack.push(item.v);
      continue;
    }

    if (item.k === 'var') {
      const key = item.v;
      const lk = key.toLowerCase();
      if (lk === 'pi') {
        stack.push(Math.PI);
        continue;
      }
      if (lk === 'e') {
        stack.push(Math.E);
        continue;
      }
      if (!(key in variables)) throw new Error(`Unknown variable: ${key}`);
      stack.push(toNumber(variables[key]));
      continue;
    }

    if (item.k === 'op') {
      const op = OPS[item.v];
      if (!op) throw new Error(`Unknown operator: ${item.v}`);
      if (stack.length < op.args) throw new Error('Malformed expression');
      const args = stack.splice(stack.length - op.args, op.args);
      const val = op.fn(...args);
      if (!Number.isFinite(val)) throw new Error('Result is not finite');
      stack.push(val);
      continue;
    }

    if (item.k === 'call') {
      const func = FUNCS[item.name];
      if (!func) throw new Error(`Unknown function: ${item.name}`);
      if (stack.length < item.argc) throw new Error('Malformed function call');
      const args = stack.splice(stack.length - item.argc, item.argc);
      if (func.args !== 'var' && func.args !== item.argc) {
        throw new Error(`Function ${item.name} expects ${func.args} args but got ${item.argc}`);
      }
      const val = func.fn(...args);
      if (!Number.isFinite(val)) throw new Error('Result is not finite');
      stack.push(val);
    }
  }

  if (stack.length !== 1) throw new Error('Malformed expression');
  return stack[0]!;
}

@Injectable()
export class MathToolsService {
  evaluate(args: EvalArgs) {
    const expr = String(args.expression ?? '').trim();
    if (!expr) {
      return { ok: false, error: 'Expression is empty.' };
    }

    try {
      const tokens = tokenize(expr);
      const rpn = toRpn(tokens);
      const value = evalRpn(rpn, args.variables ?? {});
      const precision =
        typeof args.precision === 'number' && Number.isFinite(args.precision)
          ? Math.max(0, Math.min(12, Math.trunc(args.precision)))
          : null;
      const rounded = precision === null ? value : Number(value.toFixed(precision));

      return {
        ok: true,
        expression: expr,
        value: rounded,
        valueRaw: value,
        precision,
      };
    } catch (e: any) {
      return {
        ok: false,
        expression: expr,
        error: e?.message ? String(e.message) : 'Math evaluation failed.',
      };
    }
  }
}
