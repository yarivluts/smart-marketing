import { MetricCompilerError } from './types';

/** Function names a formula's `call` node may use — see {@link parseCall}'s doc comment for why this is a closed set rather than any identifier followed by `(`. */
export const FORMULA_FUNCTION_NAMES = ['max', 'min'] as const;
export type FormulaFunctionName = (typeof FORMULA_FUNCTION_NAMES)[number];

/**
 * A minimal arithmetic-expression AST for metric formulas (plan `04 §2`'s
 * `ad_spend / signups` style). Needed (rather than naive string
 * substitution) so the compiler can single out each `/` operand and emit it
 * as `SAFE_DIVIDE(left, right)` — a literal `/` would make BigQuery raise a
 * runtime error on any zero denominator (e.g. `cac` when `new_paying` is 0
 * for a bucket), which is exactly the kind of query a metrics dashboard
 * must not blow up on.
 */
export type FormulaAstNode =
  | { type: 'number'; value: string }
  | { type: 'identifier'; name: string }
  | { type: 'unary'; operand: FormulaAstNode }
  | { type: 'binary'; op: '+' | '-' | '*' | '/'; left: FormulaAstNode; right: FormulaAstNode }
  | { type: 'call'; name: FormulaFunctionName; args: FormulaAstNode[] };

interface Token {
  kind: 'number' | 'identifier' | 'op' | 'lparen' | 'rparen' | 'comma';
  value: string;
}

const TOKEN_PATTERN = /^([0-9]+(?:\.[0-9]+)?|[a-z][a-z0-9_]*|[+\-*/(),])\s*/;

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let rest = formula.trim();
  while (rest.length > 0) {
    const match = TOKEN_PATTERN.exec(rest);
    if (!match) {
      throw new MetricCompilerError(`Unable to parse formula "${formula}" near "${rest}".`);
    }
    const value = match[1];
    if (/^[0-9]/.test(value)) {
      tokens.push({ kind: 'number', value });
    } else if (/^[a-z]/.test(value)) {
      tokens.push({ kind: 'identifier', value });
    } else if (value === '(') {
      tokens.push({ kind: 'lparen', value });
    } else if (value === ')') {
      tokens.push({ kind: 'rparen', value });
    } else if (value === ',') {
      tokens.push({ kind: 'comma', value });
    } else {
      tokens.push({ kind: 'op', value });
    }
    rest = rest.slice(match[0].length);
  }
  return tokens;
}

class TokenStream {
  private position = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly formula: string,
  ) {}

  peek(): Token | undefined {
    return this.tokens[this.position];
  }

  next(): Token {
    const token = this.tokens[this.position];
    if (!token) {
      throw new MetricCompilerError(`Unexpected end of formula "${this.formula}".`);
    }
    this.position += 1;
    return token;
  }

  atEnd(): boolean {
    return this.position >= this.tokens.length;
  }
}

function isFormulaFunctionName(name: string): name is FormulaFunctionName {
  return (FORMULA_FUNCTION_NAMES as readonly string[]).includes(name);
}

/**
 * `name(arg, arg, ...)` — an identifier immediately followed by `(` is a
 * function call, not a metric reference, so it must be parsed (and later
 * excluded from `collectIdentifiers`) before a bare `identifier` node is
 * ever produced for it. Restricted to `max`/`min` (compiled to BigQuery's
 * `GREATEST`/`LEAST`, see `compiler.ts`) rather than any identifier the
 * caller writes followed by `(` — an unrecognized name is almost certainly
 * a typo the caller wants surfaced immediately, not silently accepted as
 * some future function this compiler doesn't know how to emit SQL for.
 */
function parseCall(stream: TokenStream, name: string): FormulaAstNode {
  if (!isFormulaFunctionName(name)) {
    throw new MetricCompilerError(`Unknown function "${name}(...)" in formula — only ${FORMULA_FUNCTION_NAMES.join('/')} are supported.`);
  }
  stream.next(); // consume "("
  const args: FormulaAstNode[] = [parseExpr(stream)];
  while (stream.peek()?.kind === 'comma') {
    stream.next();
    args.push(parseExpr(stream));
  }
  const close = stream.next();
  if (close.kind !== 'rparen') {
    throw new MetricCompilerError(`Expected ")" to close "${name}(...)" in formula.`);
  }
  if (args.length < 2) {
    throw new MetricCompilerError(`"${name}(...)" requires at least 2 arguments.`);
  }
  return { type: 'call', name, args };
}

function parseFactor(stream: TokenStream): FormulaAstNode {
  const token = stream.next();
  if (token.kind === 'number') {
    return { type: 'number', value: token.value };
  }
  if (token.kind === 'identifier') {
    if (stream.peek()?.kind === 'lparen') {
      return parseCall(stream, token.value);
    }
    return { type: 'identifier', name: token.value };
  }
  if (token.kind === 'op' && token.value === '-') {
    return { type: 'unary', operand: parseFactor(stream) };
  }
  if (token.kind === 'lparen') {
    const inner = parseExpr(stream);
    const close = stream.next();
    if (close.kind !== 'rparen') {
      throw new MetricCompilerError('Expected ")" in formula.');
    }
    return inner;
  }
  throw new MetricCompilerError(`Unexpected token "${token.value}" in formula.`);
}

function parseTerm(stream: TokenStream): FormulaAstNode {
  let node = parseFactor(stream);
  while (!stream.atEnd()) {
    const token = stream.peek();
    if (token?.kind === 'op' && (token.value === '*' || token.value === '/')) {
      stream.next();
      node = { type: 'binary', op: token.value, left: node, right: parseFactor(stream) };
    } else {
      break;
    }
  }
  return node;
}

function parseExpr(stream: TokenStream): FormulaAstNode {
  let node = parseTerm(stream);
  while (!stream.atEnd()) {
    const token = stream.peek();
    if (token?.kind === 'op' && (token.value === '+' || token.value === '-')) {
      stream.next();
      node = { type: 'binary', op: token.value, left: node, right: parseTerm(stream) };
    } else {
      break;
    }
  }
  return node;
}

/** Parses a formula (already character-validated by the registry, e.g. `ad_spend / signups`) into an AST, respecting standard `*`/`/` over `+`/`-` precedence and parens. */
export function parseFormula(formula: string): FormulaAstNode {
  const stream = new TokenStream(tokenize(formula), formula);
  const ast = parseExpr(stream);
  if (!stream.atEnd()) {
    throw new MetricCompilerError(`Unexpected trailing content in formula "${formula}".`);
  }
  return ast;
}

export function collectIdentifiers(node: FormulaAstNode): string[] {
  switch (node.type) {
    case 'number':
      return [];
    case 'identifier':
      return [node.name];
    case 'unary':
      return collectIdentifiers(node.operand);
    case 'binary':
      return [...collectIdentifiers(node.left), ...collectIdentifiers(node.right)];
    case 'call':
      return node.args.flatMap((arg) => collectIdentifiers(arg));
  }
}
