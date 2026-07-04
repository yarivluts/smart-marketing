import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    const disabled = false;
    expect(cn('a', disabled && 'b', undefined, 'c')).toBe('a c');
  });

  it('de-dupes conflicting tailwind utilities (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
