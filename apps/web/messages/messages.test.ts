import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

function messageKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    messageKeys(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function leafValues(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) {
    return [value];
  }
  return Object.values(value as Record<string, unknown>).flatMap(leafValues);
}

describe('translation resources', () => {
  it('en and he expose the exact same message keys', () => {
    expect(messageKeys(he).sort()).toEqual(messageKeys(en).sort());
  });

  it('has no empty translation values', () => {
    for (const value of [...leafValues(en), ...leafValues(he)]) {
      expect(value).not.toBe('');
    }
  });
});
