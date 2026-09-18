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

/**
 * A product string is a claim about what the software does, and for most users
 * it is the only such claim they ever read — checking it means reading this
 * repo, which they cannot do. What follows pins the claims the Firmographics
 * surface got wrong.
 */
describe('Firmographics strings claim only the classification the code performs', () => {
  /**
   * `industry` is not classified by a model and is not enriched from anywhere.
   * `classifyCompanyIndustry` (`@growthos/shared`) is a fixed 9-bucket keyword
   * list over the company name plus a TLD fallback, and it runs in the tracking
   * SDK in the visitor's own browser (`packages/tracking-sdk/src/client.ts`)
   * before the event is ever sent. Its own doc comment says so: "a
   * buildable-today, deterministic stand-in for a real AI/LLM
   * industry-classification call". The pack manifest says a real third-party
   * connector "needs a human-provisioned API key ... and is deferred".
   *
   * Three strings nonetheless said the data was "AI-classified" and that
   * installing the pack would "start classifying" profiles. Someone choosing a
   * vendor on that sentence is buying a model that does not exist; someone
   * already using it is trusting a keyword match to the accuracy of one.
   *
   * Asserted as absence-of-claim rather than exact prose so the wording stays
   * editable — what must not come back is the claim. If a real classifier is
   * ever wired in, this test is the thing that should be deleted in that PR,
   * which is the point: the claim and the capability change together.
   */
  const PROVENANCE_CLAIM_KEYS = [
    ['Firmographics', 'description'],
    ['Firmographics', 'setupIntro'],
    ['ProjectPlugins', 'builtinPackFirmographicDescription'],
  ] as const;

  // Matched case-insensitively against each string. "AI-classified"/"AI
  // classification" and "enrich"/"enrichment" are the two families; plain "AI"
  // is deliberately NOT banned, because the corrected strings say what the
  // feature is *not* ("not by an AI model"), which is the honest sentence.
  const FALSE_CLAIMS = [/ai[- ]classif/i, /classified by/i, /\benriche[sd]\b/i];

  it.each(PROVENANCE_CLAIM_KEYS)('%s.%s claims neither AI classification nor enrichment', (namespace, key) => {
    for (const [locale, messages] of [
      ['en', en],
      ['he', he],
    ] as const) {
      const text = (messages as Record<string, Record<string, string>>)[namespace][key];
      for (const claim of FALSE_CLAIMS) {
        expect({ locale, namespace, key, matched: claim.source, text: claim.test(text) ? text : null }).toEqual({
          locale,
          namespace,
          key,
          matched: claim.source,
          text: null,
        });
      }
    }
  });
});
