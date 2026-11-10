/**
 * Tiny spreadsheet engine for sheet previews: cell refs, ranges, arithmetic,
 * comparisons and a handful of functions (SUM, AVERAGE, MIN, MAX, COUNT, ROUND, ABS, IF).
 * Formulas are shown as their computed values; cycles and bad input surface as #errors.
 */

export interface CellValue {
  /** Display text. */
  value: string;
  num: number | null;
  formula?: string;
  error?: boolean;
}

export const colName = (i: number): string => {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d{1,5})$/i.exec(ref.trim());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]) - 1, c: c - 1 };
}

/** "$12,400" → 12400 · "12%" → 0.12 · "(1,200)" → -1200 · "" → null */
export function toNumber(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const pct = s.endsWith('%');
  s = s.replace(/[%$€£,\s]|AED|USD/gi, '');
  if (!/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return null;
  let n = Number(s);
  if (pct) n /= 100;
  return neg ? -n : n;
}

export function formatNum(n: number): string {
  if (!Number.isFinite(n)) return '#NUM!';
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

type Val = number | number[];
class FormulaError extends Error {}

type Tok = { t: 'num'; v: number } | { t: 'ref'; v: string } | { t: 'fn'; v: string } | { t: 'op'; v: string } | { t: 'str'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^\d*\.?\d+(e-?\d+)?%?/i.exec(src.slice(i));
      if (!m) throw new FormulaError('bad number');
      const pct = m[0].endsWith('%');
      out.push({ t: 'num', v: Number(pct ? m[0].slice(0, -1) : m[0]) / (pct ? 100 : 1) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z$]/.test(ch)) {
      const m = /^\$?[A-Za-z]+\$?\d*/.exec(src.slice(i));
      if (!m) throw new FormulaError('bad identifier');
      const word = m[0];
      i += word.length;
      if (/\d$/.test(word)) out.push({ t: 'ref', v: word.toUpperCase() });
      else out.push({ t: 'fn', v: word.toUpperCase() });
      continue;
    }
    if (ch === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new FormulaError('unterminated string');
      out.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^(),:<>=&'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    throw new FormulaError(`unexpected ${ch}`);
  }
  return out;
}

const flat = (v: Val): number[] => (Array.isArray(v) ? v : [v]);
const scalar = (v: Val): number => {
  if (Array.isArray(v)) {
    if (v.length === 1) return v[0];
    throw new FormulaError('range used as a value');
  }
  return v;
};

export function evaluateSheet(rows: string[][]): CellValue[][] {
  const cache = new Map<string, number>();
  const visiting = new Set<string>();
  const errors = new Map<string, string>();

  const cellNum = (r: number, c: number): number => {
    const key = `${r}:${c}`;
    if (cache.has(key)) return cache.get(key) as number;
    const raw = rows[r]?.[c] ?? '';
    if (!raw.startsWith('=')) return toNumber(raw) ?? 0;
    if (visiting.has(key)) throw new FormulaError('#CYCLE!');
    visiting.add(key);
    try {
      const n = evalFormula(raw.slice(1));
      cache.set(key, n);
      return n;
    } finally {
      visiting.delete(key);
    }
  };

  const evalFormula = (src: string): number => {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v: string) => {
      const t = toks[p];
      return t !== undefined && t.t === 'op' && t.v === v;
    };
    const expect = (v: string) => {
      if (!isOp(v)) throw new FormulaError(`expected ${v}`);
      p++;
    };

    const range = (a: string, b: string): number[] => {
      const x = parseRef(a);
      const y = parseRef(b);
      if (!x || !y) throw new FormulaError('#REF!');
      const out: number[] = [];
      for (let r = Math.min(x.r, y.r); r <= Math.max(x.r, y.r); r++)
        for (let c = Math.min(x.c, y.c); c <= Math.max(x.c, y.c); c++) {
          const raw = rows[r]?.[c] ?? '';
          if (raw.startsWith('=') || toNumber(raw) !== null) out.push(cellNum(r, c));
        }
      return out;
    };

    const call = (name: string, args: Val[]): number => {
      const all = args.flatMap(flat);
      switch (name) {
        case 'SUM':
          return all.reduce((s, n) => s + n, 0);
        case 'AVERAGE':
        case 'AVG':
          if (!all.length) throw new FormulaError('#DIV/0!');
          return all.reduce((s, n) => s + n, 0) / all.length;
        case 'MIN':
          return all.length ? Math.min(...all) : 0;
        case 'MAX':
          return all.length ? Math.max(...all) : 0;
        case 'COUNT':
          return all.length;
        case 'ROUND': {
          const digits = args[1] !== undefined ? scalar(args[1]) : 0;
          const f = 10 ** digits;
          return Math.round(scalar(args[0]) * f) / f;
        }
        case 'ABS':
          return Math.abs(scalar(args[0]));
        case 'IF':
          return scalar(args[0]) ? scalar(args[1] ?? 0) : scalar(args[2] ?? 0);
        default:
          throw new FormulaError('#NAME?');
      }
    };

    const primary = (): Val => {
      const t = peek();
      if (!t) throw new FormulaError('unexpected end');
      if (t.t === 'num') {
        p++;
        return t.v;
      }
      if (t.t === 'str') {
        p++;
        return toNumber(t.v) ?? 0;
      }
      if (t.t === 'ref') {
        p++;
        if (isOp(':')) {
          p++;
          const b = peek();
          if (!b || b.t !== 'ref') throw new FormulaError('#REF!');
          p++;
          return range(t.v, b.v);
        }
        const ref = parseRef(t.v);
        if (!ref) throw new FormulaError('#REF!');
        return cellNum(ref.r, ref.c);
      }
      if (t.t === 'fn') {
        p++;
        if (t.v === 'TRUE') return 1;
        if (t.v === 'FALSE') return 0;
        expect('(');
        const args: Val[] = [];
        if (!isOp(')')) {
          args.push(compare());
          while (isOp(',')) {
            p++;
            args.push(compare());
          }
        }
        expect(')');
        return call(t.v, args);
      }
      if (isOp('(')) {
        p++;
        const v = compare();
        expect(')');
        return v;
      }
      throw new FormulaError('unexpected token');
    };
    const power = (): Val => {
      let v = primary();
      while (isOp('^')) {
        p++;
        v = scalar(v) ** scalar(primary());
      }
      return v;
    };
    const unary = (): Val => {
      if (isOp('-')) {
        p++;
        return -scalar(unary());
      }
      if (isOp('+')) {
        p++;
        return unary();
      }
      return power();
    };
    const term = (): Val => {
      let v = unary();
      while (isOp('*') || isOp('/')) {
        const op = (toks[p] as { v: string }).v;
        p++;
        const rhs = scalar(unary());
        if (op === '/' && rhs === 0) throw new FormulaError('#DIV/0!');
        v = op === '*' ? scalar(v) * rhs : scalar(v) / rhs;
      }
      return v;
    };
    const expr = (): Val => {
      let v = term();
      while (isOp('+') || isOp('-')) {
        const op = (toks[p] as { v: string }).v;
        p++;
        const rhs = scalar(term());
        v = op === '+' ? scalar(v) + rhs : scalar(v) - rhs;
      }
      return v;
    };
    const compare = (): Val => {
      const v = expr();
      const t = peek();
      if (t && t.t === 'op' && ['<', '>', '<=', '>=', '=', '<>'].includes(t.v)) {
        p++;
        const a = scalar(v);
        const b = scalar(expr());
        switch (t.v) {
          case '<':
            return a < b ? 1 : 0;
          case '>':
            return a > b ? 1 : 0;
          case '<=':
            return a <= b ? 1 : 0;
          case '>=':
            return a >= b ? 1 : 0;
          case '=':
            return a === b ? 1 : 0;
          default:
            return a !== b ? 1 : 0;
        }
      }
      return v;
    };

    const result = compare();
    if (p < toks.length) throw new FormulaError('#ERROR!');
    return scalar(result);
  };

  return rows.map((row, r) =>
    row.map((raw, c) => {
      if (!raw.startsWith('=')) return { value: raw, num: toNumber(raw) };
      try {
        const n = cellNum(r, c);
        return { value: formatNum(n), num: n, formula: raw };
      } catch (e) {
        const msg = e instanceof FormulaError && e.message.startsWith('#') ? e.message : '#ERROR!';
        errors.set(`${r}:${c}`, msg);
        return { value: msg, num: null, formula: raw, error: true };
      }
    }),
  );
}
