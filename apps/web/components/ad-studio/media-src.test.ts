import { describe, expect, it } from 'vitest';
import { withFirstFrame } from './media-src';

describe('withFirstFrame', () => {
  it('asks the browser for the first frame, keeping the query, and leaves an existing fragment alone', () => {
    expect(withFirstFrame('/api/clips/c1/media')).toBe('/api/clips/c1/media#t=0.1');
    expect(withFirstFrame('/api/clips/c1/media?v=2')).toBe('/api/clips/c1/media?v=2#t=0.1');
    expect(withFirstFrame('/api/clips/c1/media#t=3')).toBe('/api/clips/c1/media#t=3');
  });
});
