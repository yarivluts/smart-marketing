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

/**
 * Reads one `Namespace.key` message out of a locale bundle.
 *
 * Not a cast: the bundles are nested deeper than two levels in places, so
 * asserting `Record<string, Record<string, string>>` over the whole thing is a
 * type error, and casting through `unknown` to silence it would also silence a
 * key that no longer exists. Throwing instead means a renamed or moved key
 * fails as "this key is gone" rather than as an assertion against `undefined`,
 * which reads like the string merely has the wrong content.
 */
function messageAt(messages: unknown, namespace: string, key: string): string {
  const section = (messages as Record<string, unknown>)[namespace];
  const value = typeof section === 'object' && section !== null ? (section as Record<string, unknown>)[key] : undefined;
  if (typeof value !== 'string') {
    throw new Error(`${namespace}.${key} is not a string message — this test points at a key that was renamed or moved.`);
  }
  return value;
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
      const text = messageAt(messages, namespace, key);
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

describe('money strings disclose the unit their amount is actually in', () => {
  /**
   * `Firmographics.compositionMrr` renders `firmographic_mrr_total`, which sums
   * `dim_subscription.mrr` <- `properties.mrr_normalized` <-
   * `computeSubscriptionMrrNormalized`, which divides a Stripe price's
   * `unit_amount` by its billing-cycle length and converts no units. Stripe
   * quotes `unit_amount` in the currency's smallest unit, so a $99/mo plan
   * arrives as 9900.
   *
   * The string used to read `${amount} MRR`, which is worse than an unlabelled
   * number: the `$` positively asserts dollars, so 9900 reads as ninety-nine
   * hundred dollars rather than as an ambiguous figure a reader might question.
   *
   * The fix follows KAN-145's precedent on the Billing Ops feed exactly —
   * disclose the unit, do not convert. The divisor differs by currency (JPY has
   * none), so dividing by 100 here would be wrong more quietly than not
   * dividing. Asserting the same marker both places is what keeps the two
   * surfaces from drifting apart again.
   */
  it.each([
    ['BillingOpsFeed', 'mrrLine'],
    ['BillingOpsFeed', 'amountLine'],
    ['Firmographics', 'compositionMrr'],
  ])('%s.%s discloses the unit in en and asserts no currency symbol in either locale', (namespace, key) => {
    const read = (messages: unknown) => messageAt(messages, namespace, key);

    expect({ key: `${namespace}.${key}`, discloses: read(en).includes('(smallest unit)') }).toEqual({
      key: `${namespace}.${key}`,
      discloses: true,
    });

    // Any currency symbol at all, in either locale, and not just one leading the
    // placeholder: Hebrew's own version of this string carried the `$` *after*
    // the amount (`{amount}$ ...`), which a leading-symbol pattern would have
    // passed while reading just as falsely. A currency *code* rendered from the
    // data (`{currency}`) stays fine — that is reported, not asserted.
    for (const [locale, messages] of [
      ['en', en],
      ['he', he],
    ] as const) {
      const text = read(messages);
      expect({ locale, key: `${namespace}.${key}`, currencySymbol: /[$€£¥₪]/.test(text) ? text : null }).toEqual({
        locale,
        key: `${namespace}.${key}`,
        currencySymbol: null,
      });
    }
  });
});
