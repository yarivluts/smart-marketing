import { describe, expect, it } from 'vitest';
import { isolate } from './bidi';

describe('isolate', () => {
  it('wraps the value in first-strong isolate marks', () => {
    const out = isolate('example.com');
    expect(out.startsWith('⁨')).toBe(true);
    expect(out.endsWith('⁩')).toBe(true);
    expect(out.slice(1, -1)).toBe('example.com');
  });
});
