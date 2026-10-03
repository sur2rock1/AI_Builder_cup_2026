// ─────────────────────────────────────────────────────────────────
// Safe maths-expression compiler for `function` bricks (y = f(x)).
//
// Model output is untrusted, so this never touches eval/new Function:
// a small recursive-descent parser over a whitelist of operators,
// functions and constants, compiled to plain closures. It accepts the
// way people (and models) actually write school maths — "2x + 1",
// "3(x - 2)^2", "y = x² − 4", "√(x+1)", "|x|" — and rejects anything
// else with a readable error the generator can hand back for repair.
// ─────────────────────────────────────────────────────────────────

export type CompiledExpr = (x: number) => number;

export type CompileResult =
  | { ok: true; fn: CompiledExpr; normalized: string }
  | { ok: false; error: string };

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
// Longest first so "asin" wins over "sin", "sqrt" over nothing, etc.
const WORDS = [...Object.keys(FUNCS), ...Object.keys(CONSTS), 'x'].sort((a, b) => b.length - a.length);

const MAX_LEN = 160;
const MAX_DEPTH = 48;

type Tok =
  | { t: 'num'; v: number }
  | { t: 'x' }
  | { t: 'const'; v: number }
  | { t: 'func'; name: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' }
  | { t: '(' } | { t: ')' } | { t: '|' };

/** Normalise unicode maths and strip a leading "y =" / "f(x) =". */
export function normalizeExpr(src: string): string {
  let s = String(src ?? '').trim();
  s = s.replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
  s = s
    .replace(/[−–—]/g, '-')
    .replace(/[×·∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([0-9.]+|x)/g, 'sqrt($1)')
    .replace(/\*\*/g, '^')
    .toLowerCase();
  return s.replace(/\s+/g, ' ').trim();
}

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) throw new Error(`bad number at "${s.slice(i, i + 6)}"`);
      out.push({ t: 'num', v: Number(m[1]) });
      i += m[1].length;
      continue;
    }
    if (/[a-z]/.test(c)) {
      const m = /^[a-z]+/.exec(s.slice(i))!;
      let word = m[0];
      i += word.length;
      // Split run-together words: "xsin" → x, sin; "2pix" → pi, x.
      while (word.length) {
        const hit = WORDS.find((w) => word.startsWith(w));
        if (!hit) throw new Error(`unknown name "${word}" (allowed: x, ${Object.keys(FUNCS).join(', ')}, pi, e)`);
        if (hit === 'x') out.push({ t: 'x' });
        else if (hit in CONSTS) out.push({ t: 'const', v: CONSTS[hit] });
        else out.push({ t: 'func', name: hit });
        word = word.slice(hit.length);
      }
      continue;
    }
    if ('+-*/^'.includes(c)) { out.push({ t: 'op', v: c as any }); i++; continue; }
    if (c === '(' || c === '[' || c === '{') { out.push({ t: '(' }); i++; continue; }
    if (c === ')' || c === ']' || c === '}') { out.push({ t: ')' }); i++; continue; }
    if (c === '|') { out.push({ t: '|' }); i++; continue; }
    throw new Error(`unexpected character "${c}"`);
  }
  return out;
}

class Parser {
  private i = 0;
  private depth = 0;
  constructor(private toks: Tok[]) {}

  parse(): CompiledExpr {
    if (!this.toks.length) throw new Error('empty expression');
    const f = this.expr();
    if (this.i < this.toks.length) throw new Error('unexpected trailing input');
    return f;
  }

  private peek(): Tok | undefined { return this.toks[this.i]; }
  private next(): Tok | undefined { return this.toks[this.i++]; }

  private guard<T>(fn: () => T): T {
    if (++this.depth > MAX_DEPTH) throw new Error('expression nested too deeply');
    try { return fn(); } finally { this.depth--; }
  }

  private expr(): CompiledExpr {
    return this.guard(() => {
      let left = this.term();
      for (;;) {
        const t = this.peek();
        if (t?.t === 'op' && (t.v === '+' || t.v === '-')) {
          this.i++;
          const right = this.term();
          const l = left;
          left = t.v === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
        } else return left;
      }
    });
  }

  /** Does the next token begin an operand? (Used for implicit multiplication.) */
  private startsOperand(t: Tok | undefined): boolean {
    return !!t && (t.t === 'num' || t.t === 'x' || t.t === 'const' || t.t === 'func' || t.t === '(');
  }

  private term(): CompiledExpr {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) {
        this.i++;
        const right = this.unary();
        const l = left;
        left = t.v === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
      } else if (this.startsOperand(t)) {
        // "2x", "3(x+1)", "x sin(x)" — implicit multiplication.
        const right = this.power();
        const l = left;
        left = (x) => l(x) * right(x);
      } else return left;
    }
  }

  private unary(): CompiledExpr {
    return this.guard(() => {
      const t = this.peek();
      if (t?.t === 'op' && (t.v === '-' || t.v === '+')) {
        this.i++;
        const inner = this.unary();
        return t.v === '-' ? (x) => -inner(x) : inner;
      }
      return this.power();
    });
  }

  private power(): CompiledExpr {
    const base = this.primary();
    const t = this.peek();
    if (t?.t === 'op' && t.v === '^') {
      this.i++;
      const exp = this.unary(); // right-associative; allows 2^-1
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }

  private primary(): CompiledExpr {
    return this.guard(() => {
      const t = this.next();
      if (!t) throw new Error('expression ends too early');
      switch (t.t) {
        case 'num': { const v = t.v; return () => v; }
        case 'x': return (x) => x;
        case 'const': { const v = t.v; return () => v; }
        case 'func': {
          const fn = FUNCS[t.name];
          // Accept "sin(x)" and the common shorthand "sin x".
          if (this.peek()?.t === '(') {
            this.i++;
            const arg = this.expr();
            if (this.next()?.t !== ')') throw new Error(`missing ")" after ${t.name}(`);
            return (x) => fn(arg(x));
          }
          const arg = this.power();
          return (x) => fn(arg(x));
        }
        case '(': {
          const inner = this.expr();
          if (this.next()?.t !== ')') throw new Error('missing ")"');
          return inner;
        }
        case '|': {
          const inner = this.expr();
          if (this.next()?.t !== '|') throw new Error('missing closing "|"');
          return (x) => Math.abs(inner(x));
        }
        default:
          throw new Error(`unexpected "${t.t === 'op' ? t.v : t.t}"`);
      }
    });
  }
}

/** Compile an expression in x. Never throws. */
export function compileExpr(src: string): CompileResult {
  const normalized = normalizeExpr(src);
  if (!normalized) return { ok: false, error: 'empty expression' };
  if (normalized.length > MAX_LEN) return { ok: false, error: `expression longer than ${MAX_LEN} characters` };
  try {
    const fn = new Parser(tokenize(normalized)).parse();
    // Must be evaluable somewhere sensible, or it is not a plottable function.
    const probes = [-3, -1, -0.5, 0, 0.5, 1, 2, 3, 7];
    if (!probes.some((p) => Number.isFinite(fn(p)))) {
      return { ok: false, error: 'expression is not finite anywhere near the origin' };
    }
    return { ok: true, fn, normalized };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/** Evaluate once; NaN on any failure. */
export function evalExpr(src: string, x: number): number {
  const c = compileExpr(src);
  return c.ok ? c.fn(x) : NaN;
}
