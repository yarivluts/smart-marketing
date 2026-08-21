import { describe, expect, it } from 'vitest';
import { assertSafeIdentifier, quoteIdentifier } from './identifiers';
import { MetricCompilerError } from './types';

describe('assertSafeIdentifier', () => {
  it('accepts a lowercase identifier', () => {
    expect(assertSafeIdentifier('ad_spend', 'column')).toBe('ad_spend');
  });

  it('accepts an identifier with digits after the first character', () => {
    expect(assertSafeIdentifier('utm_source_2', 'dimension')).toBe('utm_source_2');
  });

  it('accepts an identifier starting with an underscore', () => {
    expect(assertSafeIdentifier('_internal', 'table')).toBe('_internal');
  });

  it('accepts a single-character identifier', () => {
    expect(assertSafeIdentifier('a', 'column')).toBe('a');
  });

  it('accepts mixed-case letters', () => {
    expect(assertSafeIdentifier('CamelCase', 'table')).toBe('CamelCase');
  });

  it('rejects an identifier starting with a digit', () => {
    expect(() => assertSafeIdentifier('1metric', 'column')).toThrow(MetricCompilerError);
  });

  it('rejects an empty string', () => {
    expect(() => assertSafeIdentifier('', 'table')).toThrow(MetricCompilerError);
  });

  it('rejects an identifier containing a space', () => {
    expect(() => assertSafeIdentifier('ad spend', 'column')).toThrow(MetricCompilerError);
  });

  it('rejects an identifier containing a dot (schema-qualified name)', () => {
    expect(() => assertSafeIdentifier('core.entities', 'table')).toThrow(MetricCompilerError);
  });

  it('rejects a backtick, blocking identifier-quote escape', () => {
    expect(() => assertSafeIdentifier('a`b', 'column')).toThrow(MetricCompilerError);
  });

  it('rejects a semicolon-delimited SQL-injection attempt', () => {
    expect(() => assertSafeIdentifier('events; DROP TABLE users', 'table')).toThrow(MetricCompilerError);
  });

  it('rejects a comment-injection attempt', () => {
    expect(() => assertSafeIdentifier('events -- comment', 'table')).toThrow(MetricCompilerError);
  });

  it('rejects a value that is only whitespace', () => {
    expect(() => assertSafeIdentifier('   ', 'column')).toThrow(MetricCompilerError);
  });

  it('rejects a value with trailing whitespace', () => {
    expect(() => assertSafeIdentifier('ad_spend ', 'column')).toThrow(MetricCompilerError);
  });

  it('includes the offending value and kind in the error message', () => {
    expect(() => assertSafeIdentifier('bad value', 'dimension')).toThrow(
      'Unsafe dimension identifier "bad value" — only letters, digits, and underscores are allowed, and it must start with a letter or underscore.',
    );
  });
});

describe('quoteIdentifier', () => {
  it('wraps the identifier in backticks', () => {
    expect(quoteIdentifier('ad_spend')).toBe('`ad_spend`');
  });

  it('wraps a single-character identifier', () => {
    expect(quoteIdentifier('a')).toBe('`a`');
  });

  it('does not validate the value — callers must run assertSafeIdentifier first', () => {
    expect(quoteIdentifier('not safe; DROP TABLE x')).toBe('`not safe; DROP TABLE x`');
  });
});
