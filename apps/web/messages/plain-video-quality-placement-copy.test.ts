import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// Hebrew is written as escapes (no Hebrew in code files).

function find(node: any, key: string): any {
  if (!node || typeof node !== 'object') return undefined;
  if (key in node) return node[key];
  for (const v of Object.values(node)) {
    const r = find(v, key);
    if (r !== undefined) return r;
  }
  return undefined;
}

describe('plain video quality and ad placement labels', () => {
  it('the top video quality says "high quality" instead of "full HD"', () => {
    const enRes = find(en, 'resolution');
    const heRes = find(he, 'resolution');
    expect(enRes['1080p']).toBe('1080p - sharp, high quality');
    expect(heRes['1080p']).toBe('1080p - איכות גבוהה');
    expect(JSON.stringify(heRes)).not.toMatch(/Full HD/i);
  });

  it('the Audience Network placement is named in plain words in both languages', () => {
    const enSeg = find(en, 'audience_network');
    const heSeg = find(he, 'audience_network');
    expect(enSeg).toBe('Partner apps and sites');
    expect(heSeg).toBe('אפליקציות ואתרים שותפים');
    expect(heSeg).not.toMatch(/[A-Za-z]/);
  });
});
