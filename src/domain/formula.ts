/**
 * Formula engine (CLAUDE.md section 6).
 *
 * A formula is a string that starts with "=". Anything else is read as a plain
 * number ("1,200" -> 1200, "7%" -> 0.07, "₪ 50" -> 50). Empty means null.
 *
 * Hand-written recursive-descent parser. No eval, no new Function.
 * Ported from reference/prototype.html (parseFx / evalAst / valueOf).
 */

import type { Val } from './types';

export class FxErr extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FxErr';
  }
}

/* ------------------------------------------------------------------ */
/* AST                                                                 */
/* ------------------------------------------------------------------ */

export type Ast =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'id'; name: string }
  | { k: 'call'; fn: string; args: Ast[] }
  | { k: 'neg'; a: Ast }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: Ast; b: Ast };

type Token =
  | { t: 'n'; v: number }
  | { t: 's'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

/** Identifier: starts with a letter (any script) or underscore. */
export const NAME_SOURCE = '[\\p{L}_][\\p{L}\\p{N}_]*';
export const NAME_RE = new RegExp(`^${NAME_SOURCE}$`, 'u');

const TOK = new RegExp(`\\s+|(\\d+(?:\\.\\d+)?)|("([^"]*)")|(${NAME_SOURCE})|([+\\-*/(),])`, 'uy');

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    TOK.lastIndex = i;
    const m = TOK.exec(src);
    if (!m) {
      if (src[i] === '"') throw new FxErr('חסרות מירכאות סוגרות');
      throw new FxErr('תו לא מוכר: ' + src[i]);
    }
    i = TOK.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'n', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 's', v: m[3] ?? '' });
    else if (m[4] !== undefined) out.push({ t: 'id', v: m[4] });
    else if (m[5] !== undefined) out.push({ t: 'op', v: m[5] });
  }
  return out;
}

const parseCache = new Map<string, Ast>();

/** Parse a formula body (without the leading "="). Throws FxErr. */
export function parse(src: string): Ast {
  const hit = parseCache.get(src);
  if (hit) return hit;

  const t = tokenize(src);
  let p = 0;
  const peek = (): Token | undefined => t[p];
  const isOp = (v: string): boolean => {
    const k = t[p];
    return k !== undefined && k.t === 'op' && k.v === v;
  };
  const expect = (v: string): void => {
    const k = t[p++];
    if (!k || k.t !== 'op' || k.v !== v) throw new FxErr(v === ')' ? 'חסר סוגר )' : 'חסר ' + v);
  };

  function expr(): Ast {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const op = (t[p++] as Token).v as '+' | '-';
      a = { k: 'bin', op, a, b: term() };
    }
    return a;
  }
  function term(): Ast {
    let a = unary();
    while (isOp('*') || isOp('/')) {
      const op = (t[p++] as Token).v as '*' | '/';
      a = { k: 'bin', op, a, b: unary() };
    }
    return a;
  }
  function unary(): Ast {
    if (isOp('-')) {
      p++;
      return { k: 'neg', a: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return prim();
  }
  function prim(): Ast {
    const k = t[p++];
    if (!k) throw new FxErr('הנוסחה לא שלמה');
    if (k.t === 'n') return { k: 'num', v: k.v };
    if (k.t === 's') return { k: 'str', v: k.v };
    if (k.t === 'id') {
      if (isOp('(')) {
        p++;
        const args: Ast[] = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) {
            p++;
            args.push(expr());
          }
        }
        expect(')');
        return { k: 'call', fn: k.v, args };
      }
      return { k: 'id', name: k.v };
    }
    if (k.v === '(') {
      const e = expr();
      expect(')');
      return e;
    }
    throw new FxErr('לא צפוי: ' + k.v);
  }

  const ast = expr();
  const rest = peek();
  if (rest) throw new FxErr('לא צפוי: ' + String(rest.v));
  parseCache.set(src, ast);
  return ast;
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export interface FormulaContext {
  /** Resolve a name: event param, then global, then price. Throws FxErr if unknown. */
  lookup(name: string): number;
  /** Salary of a guide (מנחה) for the event, by row name, at the budget's salary level. */
  sal(name: string): number;
}

/** A context where every name is unknown. Used for globals, prices and salary values. */
export const EMPTY_CONTEXT: FormulaContext = {
  lookup: (name) => {
    throw new FxErr('שם לא מוכר: ' + name);
  },
  sal: () => {
    throw new FxErr('אין כאן גישה לטבלת השכר');
  },
};

type Fn = { min: number; max: number; run: (a: number[]) => number };

const roundUp: Fn = { min: 1, max: 1, run: (a) => Math.ceil(a[0]! - 1e-9) };
const roundDown: Fn = { min: 1, max: 1, run: (a) => Math.floor(a[0]! + 1e-9) };
const max: Fn = { min: 1, max: Infinity, run: (a) => Math.max(...a) };
const min: Fn = { min: 1, max: Infinity, run: (a) => Math.min(...a) };

const FUNCS: Record<string, Fn> = {
  'למעלה': roundUp,
  ROUNDUP: roundUp,
  'למטה': roundDown,
  'עגל': {
    min: 1,
    max: 2,
    run: (a) => {
      const f = Math.pow(10, a[1] ?? 0);
      return Math.round(a[0]! * f) / f;
    },
  },
  // As in the prototype: ROUND ignores digits and rounds to an integer.
  ROUND: { min: 1, max: 2, run: (a) => Math.round(a[0]!) },
  'מקס': max,
  MAX: max,
  'מינ': min,
  MIN: min,
};

/** Names of all functions, for help text and autocomplete. */
export const FUNCTION_NAMES: readonly string[] = [...Object.keys(FUNCS), 'שכר'];

/** Coerce a value inside a formula to a number ("1,200" -> 1200). */
export function num(v: number | string): number {
  if (typeof v === 'number') return v;
  const x = parseFloat(v.replace(/[,₪\s]/g, ''));
  if (!isNaN(x)) return x;
  throw new FxErr('ערך לא מספרי');
}

function evalAst(n: Ast, ctx: FormulaContext): number | string {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'str':
      return n.v;
    case 'id':
      return ctx.lookup(n.name);
    case 'call': {
      if (n.fn === 'שכר') {
        if (n.args.length !== 1) throw new FxErr('שכר() מקבלת שם אחד במירכאות');
        const arg = evalAst(n.args[0]!, ctx);
        return ctx.sal(String(arg));
      }
      const fn = FUNCS[n.fn];
      if (!fn) throw new FxErr('פונקציה לא מוכרת: ' + n.fn);
      if (n.args.length < fn.min || n.args.length > fn.max) {
        throw new FxErr('מספר ערכים שגוי ב-' + n.fn + '()');
      }
      return fn.run(n.args.map((x) => num(evalAst(x, ctx))));
    }
    case 'neg':
      return -num(evalAst(n.a, ctx));
    case 'bin': {
      const a = num(evalAst(n.a, ctx));
      const b = num(evalAst(n.b, ctx));
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0) throw new FxErr('חלוקה באפס');
          return a / b;
      }
    }
  }
}

export const isFx = (v: unknown): v is string => typeof v === 'string' && v.trim().startsWith('=');

/**
 * Evaluate a raw field value: number, plain text number, or formula.
 * Returns null for empty. Throws FxErr with a Hebrew message on any problem.
 */
export function valueOf(raw: unknown, ctx: FormulaContext): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!isFinite(raw)) throw new FxErr('התוצאה אינה מספר');
    return raw;
  }
  const s = String(raw).trim();
  if (s === '') return null;
  if (s.startsWith('=')) {
    const body = s.slice(1);
    if (body.trim() === '') throw new FxErr('הנוסחה ריקה');
    const v = evalAst(parse(body), ctx);
    if (typeof v !== 'number' || !isFinite(v)) throw new FxErr('התוצאה אינה מספר');
    return v;
  }
  let t = s.replace(/[,₪\s]/g, '');
  let pct = false;
  if (t.endsWith('%')) {
    pct = true;
    t = t.slice(0, -1);
  }
  // Number() rejects trailing junk ("12abc") where parseFloat would accept it.
  const x = t === '' ? NaN : Number(t);
  if (isNaN(x)) throw new FxErr('לא מספר ולא נוסחה');
  return pct ? x / 100 : x;
}

/** Normalize user input before storing it: plain numbers are stored as numbers. */
export function normalizeInput(raw: string): Val {
  const s = String(raw).trim();
  if (s === '') return '';
  if (s.startsWith('=')) return s;
  const t = s.replace(/[,₪\s]/g, '');
  if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  return s;
}

/** Names referenced in a formula (for help, autocomplete and dependency checks). */
export function referencedNames(raw: unknown): string[] {
  if (!isFx(raw)) return [];
  let ast: Ast;
  try {
    ast = parse(raw.trim().slice(1));
  } catch {
    return [];
  }
  const out = new Set<string>();
  const walk = (n: Ast): void => {
    if (n.k === 'id') out.add(n.name);
    else if (n.k === 'call') n.args.forEach(walk);
    else if (n.k === 'neg') walk(n.a);
    else if (n.k === 'bin') {
      walk(n.a);
      walk(n.b);
    }
  };
  walk(ast);
  return [...out];
}
