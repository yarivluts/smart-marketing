import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, unknown>;

/** Every sentence under a Growth Pilot namespace, flattened. */
function sentences(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (node && typeof node === 'object') return Object.values(node as Copy).flatMap(sentences);
  return [];
}

describe('Growth Pilot: Facebook and Instagram, not "Meta"', () => {
  for (const [locale, messages] of [['en', en], ['he', he]] as const) {
    it(`${locale}: no sentence a beginner reads names the company behind Facebook`, () => {
      const pilot = (messages as unknown as Record<string, Copy>).GrowthPilot;
      for (const text of sentences(pilot)) expect(text).not.toMatch(/\(Meta\)/);
    });
  }
});
