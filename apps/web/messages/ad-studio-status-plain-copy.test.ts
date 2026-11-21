import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Bag = Record<string, Record<string, unknown>>;

function adStudio(messages: Bag): Record<string, string> {
  const hit = Object.values(messages).find(
    (ns) => ns && typeof ns === 'object' && 'ffmpegReady' in ns && 'planningAdminHint' in ns,
  );
  if (!hit) throw new Error('Ad Studio namespace not found');
  return hit as Record<string, string>;
}

const KEYS = ['ffmpeg', 'ffmpegMissing', 'planningAdminHint'] as const;

describe('Ad Studio status panel uses plain words', () => {
  const enNs = adStudio(en as unknown as Bag);
  const heNs = adStudio(he as unknown as Bag);

  it.each(KEYS)('%s exists in en and he', (key) => {
    expect(enNs[key]).toBeTruthy();
    expect(heNs[key]).toBeTruthy();
  });

  it('does not show the tool name ffmpeg or "deep analysis" in either language', () => {
    for (const ns of [enNs, heNs]) {
      for (const key of KEYS) {
        expect(ns[key]).not.toMatch(/ffmpeg|deep analysis/i);
      }
    }
    expect(heNs.planningAdminHint).not.toContain('המעמיק');
  });

  it('says what a missing tool means for the person', () => {
    expect(enNs.ffmpegMissing).toMatch(/videos cannot be put together/);
  });
});
