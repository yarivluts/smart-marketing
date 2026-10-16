import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'creativesHeading',
  'tabCreatives',
  'quickViewCreatives',
  'noCreativesFound',
  'metaAdVisualPreviewPlaceholder',
  'cockpitDescription',
] as const;

type Bag = Record<string, Record<string, unknown>>;

function findNamespace(messages: Bag): Record<string, string> {
  const hit = Object.values(messages).find(
    (ns) => ns && typeof ns === 'object' && 'tabCreatives' in ns,
  );
  if (!hit) throw new Error('namespace with tabCreatives not found');
  return hit as Record<string, string>;
}

describe('campaign pages use plain words for ads', () => {
  const enNs = findNamespace(en as unknown as Bag);
  const heNs = findNamespace(he as unknown as Bag);

  it.each(KEYS)('%s exists in en and he', (key) => {
    expect(enNs[key]).toBeTruthy();
    expect(heNs[key]).toBeTruthy();
  });

  it('no English jargon (creative, ROAS, cockpit) is shown to a beginner', () => {
    for (const key of KEYS) {
      expect(enNs[key]).not.toMatch(/creative|ROAS|cockpit/i);
    }
  });

  it('the Hebrew copy avoids the loanword for "creative" and the ROAS acronym', () => {
    for (const key of KEYS) {
      expect(heNs[key]).not.toContain('קריאייטיב');
      expect(heNs[key]).not.toContain('ROAS');
    }
  });
});
