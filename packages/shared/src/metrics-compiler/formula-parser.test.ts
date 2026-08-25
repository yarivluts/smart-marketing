import { describe, expect, it } from 'vitest';
import { collectIdentifiers, parseFormula } from './formula-parser';
import { MetricCompilerError } from './types';

describe('parseFormula', () => {
  it('parses a single number', () => {
    expect(parseFormula('42')).toEqual({ type: 'number', value: '42' });
  });

  it('parses a decimal number', () => {
    expect(parseFormula('1.5')).toEqual({ type: 'number', value: '1.5' });
  });

  it('parses a single identifier', () => {
    expect(parseFormula('ad_spend')).toEqual({ type: 'identifier', name: 'ad_spend' });
  });

  it('binds * and / tighter than + and -', () => {
    // a + b * c => a + (b * c), not (a + b) * c
    expect(parseFormula('a + b * c')).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'identifier', name: 'a' },
      right: {
        type: 'binary',
        op: '*',
        left: { type: 'identifier', name: 'b' },
        right: { type: 'identifier', name: 'c' },
      },
    });
  });

  it('is left-associative for same-precedence additive operators', () => {
    // a - b - c => (a - b) - c, not a - (b - c)
    expect(parseFormula('a - b - c')).toEqual({
      type: 'binary',
      op: '-',
      left: {
        type: 'binary',
        op: '-',
        left: { type: 'identifier', name: 'a' },
        right: { type: 'identifier', name: 'b' },
      },
      right: { type: 'identifier', name: 'c' },
    });
  });

  it('is left-associative for same-precedence multiplicative operators', () => {
    // a / b / c => (a / b) / c, not a / (b / c)
    expect(parseFormula('a / b / c')).toEqual({
      type: 'binary',
      op: '/',
      left: {
        type: 'binary',
        op: '/',
        left: { type: 'identifier', name: 'a' },
        right: { type: 'identifier', name: 'b' },
      },
      right: { type: 'identifier', name: 'c' },
    });
  });

  it('lets parens override default precedence', () => {
    // (a + b) * c => the additive node becomes the left operand of *
    expect(parseFormula('(a + b) * c')).toEqual({
      type: 'binary',
      op: '*',
      left: {
        type: 'binary',
        op: '+',
        left: { type: 'identifier', name: 'a' },
        right: { type: 'identifier', name: 'b' },
      },
      right: { type: 'identifier', name: 'c' },
    });
  });

  it('parses nested parens', () => {
    expect(parseFormula('((a))')).toEqual({ type: 'identifier', name: 'a' });
  });

  it('parses unary minus on an identifier', () => {
    expect(parseFormula('-a')).toEqual({ type: 'unary', operand: { type: 'identifier', name: 'a' } });
  });

  it('applies unary minus before multiplication', () => {
    // a * -b => a * (-b)
    expect(parseFormula('a * -b')).toEqual({
      type: 'binary',
      op: '*',
      left: { type: 'identifier', name: 'a' },
      right: { type: 'unary', operand: { type: 'identifier', name: 'b' } },
    });
  });

  it('parses unary minus applied to a parenthesized expression', () => {
    expect(parseFormula('-(a + b)')).toEqual({
      type: 'unary',
      operand: {
        type: 'binary',
        op: '+',
        left: { type: 'identifier', name: 'a' },
        right: { type: 'identifier', name: 'b' },
      },
    });
  });

  it('parses a double unary minus', () => {
    expect(parseFormula('--a')).toEqual({
      type: 'unary',
      operand: { type: 'unary', operand: { type: 'identifier', name: 'a' } },
    });
  });

  it('tolerates arbitrary whitespace between tokens', () => {
    expect(parseFormula('  a   +   b ')).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'identifier', name: 'a' },
      right: { type: 'identifier', name: 'b' },
    });
  });

  it('throws MetricCompilerError on an unparseable character', () => {
    expect(() => parseFormula('a + $')).toThrow(MetricCompilerError);
    expect(() => parseFormula('a + $')).toThrow(/Unable to parse formula/);
  });

  it('throws MetricCompilerError on an unterminated expression', () => {
    expect(() => parseFormula('a +')).toThrow(MetricCompilerError);
    expect(() => parseFormula('a +')).toThrow(/Unexpected end of formula/);
  });

  it('throws MetricCompilerError when a paren group is unterminated at end of input', () => {
    expect(() => parseFormula('(a + b')).toThrow(MetricCompilerError);
    expect(() => parseFormula('(a + b')).toThrow(/Unexpected end of formula/);
  });

  it('throws MetricCompilerError when a token other than ")" follows a paren group', () => {
    // after "a + b" is parsed as the inner expression, the next token is the
    // identifier "c" rather than a closing paren.
    expect(() => parseFormula('(a + b c)')).toThrow(MetricCompilerError);
    expect(() => parseFormula('(a + b c)')).toThrow(/Expected "\)" in formula/);
  });

  it('throws MetricCompilerError on unexpected trailing content after a valid expression', () => {
    expect(() => parseFormula('a + b )')).toThrow(MetricCompilerError);
    expect(() => parseFormula('a + b )')).toThrow(/Unexpected trailing content/);
  });

  describe('max()/min() function calls', () => {
    it('parses a 2-argument max() call', () => {
      expect(parseFormula('max(a, b)')).toEqual({
        type: 'call',
        name: 'max',
        args: [
          { type: 'identifier', name: 'a' },
          { type: 'identifier', name: 'b' },
        ],
      });
    });

    it('parses a 2-argument min() call with an expression and a number literal argument', () => {
      expect(parseFormula('min(a - b, 0)')).toEqual({
        type: 'call',
        name: 'min',
        args: [
          { type: 'binary', op: '-', left: { type: 'identifier', name: 'a' }, right: { type: 'identifier', name: 'b' } },
          { type: 'number', value: '0' },
        ],
      });
    });

    it('parses a 3+-argument call', () => {
      expect(parseFormula('max(a, b, c)')).toEqual({
        type: 'call',
        name: 'max',
        args: [
          { type: 'identifier', name: 'a' },
          { type: 'identifier', name: 'b' },
          { type: 'identifier', name: 'c' },
        ],
      });
    });

    it('treats a function call as just another factor, so it composes with the surrounding expression', () => {
      expect(parseFormula('1 + max(a, b) * 2')).toEqual({
        type: 'binary',
        op: '+',
        left: { type: 'number', value: '1' },
        right: {
          type: 'binary',
          op: '*',
          left: { type: 'call', name: 'max', args: [{ type: 'identifier', name: 'a' }, { type: 'identifier', name: 'b' }] },
          right: { type: 'number', value: '2' },
        },
      });
    });

    it('throws MetricCompilerError on an unsupported function name', () => {
      expect(() => parseFormula('round(a)')).toThrow(MetricCompilerError);
      expect(() => parseFormula('round(a)')).toThrow(/Unknown function "round\(\.\.\.\)"/);
    });

    it('throws MetricCompilerError when max()/min() is called with fewer than 2 arguments', () => {
      expect(() => parseFormula('max(a)')).toThrow(MetricCompilerError);
      expect(() => parseFormula('max(a)')).toThrow(/requires at least 2 arguments/);
    });

    it('throws MetricCompilerError on a call missing its closing paren', () => {
      expect(() => parseFormula('max(a, b')).toThrow(MetricCompilerError);
    });
  });
});

describe('collectIdentifiers', () => {
  it('returns an empty list for a bare number', () => {
    expect(collectIdentifiers(parseFormula('42'))).toEqual([]);
  });

  it('returns a single identifier', () => {
    expect(collectIdentifiers(parseFormula('ad_spend'))).toEqual(['ad_spend']);
  });

  it('collects every identifier across binary nodes, left-to-right, with duplicates kept', () => {
    expect(collectIdentifiers(parseFormula('ad_spend / signups + ad_spend'))).toEqual(['ad_spend', 'signups', 'ad_spend']);
  });

  it('collects the identifier under a unary node', () => {
    expect(collectIdentifiers(parseFormula('-cac'))).toEqual(['cac']);
  });

  it('collects identifiers through nested parens', () => {
    expect(collectIdentifiers(parseFormula('(a + (b * c)) / d'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('collects identifiers from every argument of a call, in order, without including the function name itself', () => {
    expect(collectIdentifiers(parseFormula('max(a - b, c)'))).toEqual(['a', 'b', 'c']);
  });

  it('never treats a call\'s function name as a referenced identifier even when a same-named metric exists elsewhere in the formula', () => {
    // regression: extractFormulaReferences (metric-registry.service.ts) must not
    // mistake "max" itself for a metric name it needs to exist in the catalog.
    expect(collectIdentifiers(parseFormula('max(max_spend, 0)'))).toEqual(['max_spend']);
  });
});
