import { describe, expect, it } from 'vitest';
import { AD_STUDIO_USAGE_KINDS } from '@growthos/firebase-orm-models';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';

/** The admin usage table labels every row by its kind, so a new kind needs a label in both languages. */
describe('Ad Studio usage kind labels', () => {
  it.each([
    ['en', enMessages.AdStudio.usageKind],
    ['he', heMessages.AdStudio.usageKind],
  ])('has a %s label for every usage kind', (_locale, labels) => {
    const missing = AD_STUDIO_USAGE_KINDS.filter((kind) => !(labels as Record<string, string>)[kind]?.trim());
    expect(missing).toEqual([]);
  });
});
