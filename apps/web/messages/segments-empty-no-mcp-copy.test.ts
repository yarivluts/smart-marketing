import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('Segments empty state: no developer words', () => {
  it('en and he do not send a newcomer to MCP or agents', () => {
    for (const m of [en, he] as unknown as Copy[]) {
      expect(m.Segments.noSegmentsDetail).not.toMatch(/MCP|agent|סוכן/i);
      expect(m.Segments.noSegmentsDetail.length).toBeGreaterThan(0);
    }
  });

  it('en tells the person to create the first group below', () => {
    expect((en as unknown as Copy).Segments.noSegmentsDetail).toMatch(/Create your first group below/);
  });
});
