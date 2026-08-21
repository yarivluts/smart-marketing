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
});
