import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import he from './he.json';

/**
 * Some messages document a literal `{token}` to the user — a URL template's
 * placeholder, for instance. ICU reads that as an argument reference, so
 * next-intl throws `FORMATTING_ERROR` and renders its fallback: **the key
 * path**. The page then shows `SessionReplaySettings.templateHelp` where the
 * help text belongs.
 *
 * That is how it shipped (KAN-162). Two of the Session replay page's four
 * strings rendered as their own key paths, including the input placeholder and
 * the only sentence that told the admin the `{landing_page}` token exists — so
 * the page documented its own syntax nowhere, while looking merely untranslated
 * rather than broken.
 *
 * Nothing caught it because every check upstream passes: the key exists, en and
 * he agree, the value is non-empty, and TypeScript cannot see inside a message
 * string. It is only visible once the message is actually formatted.
 *
 * The fix is ICU apostrophe-quoting — `'{landing_page}'` — verified against
 * next-intl's own formatter rather than reasoned about from the spec.
 */

/** Messages that must render a literal brace token rather than interpolate one. */
const LITERAL_TOKEN_MESSAGES = [
  ['SessionReplaySettings', 'templatePlaceholder', '{landing_page}'],
  ['SessionReplaySettings', 'templateHelp', '{landing_page}'],
  ['SessionReplaySettings', 'intro', '{landing_page}'],
  ['SessionReplaySettings', 'savedWithoutPlaceholder', '{landing_page}'],
] as const;

describe('messages that document a literal token render it, rather than falling back to the key path', () => {
  it.each(LITERAL_TOKEN_MESSAGES)('%s.%s renders %s literally in both locales', (namespace, key, token) => {
    for (const [locale, messages] of [
      ['en', en],
      ['he', he],
    ] as const) {
      // `onError` is swallowed on purpose: next-intl reports a formatting
      // failure there and then returns the fallback, so asserting on the
      // returned string is what catches the user-visible symptom. Asserting via
      // onError would test that next-intl reports errors, which is its job.
      const t = createTranslator({ locale, messages, namespace, onError: () => {} });
      const rendered = t(key as never) as string;

      // The fallback IS the key path, so this is the whole bug in one line.
      expect({ locale, key: `${namespace}.${key}`, rendered }).not.toEqual({
        locale,
        key: `${namespace}.${key}`,
        rendered: `${namespace}.${key}`,
      });
      expect({ locale, key: `${namespace}.${key}`, containsToken: rendered.includes(token) }).toEqual({
        locale,
        key: `${namespace}.${key}`,
        containsToken: true,
      });
    }
  });

  /**
   * The guard that generalises: no message anywhere may mention `landing_page`
   * with its braces unquoted. Written as a scan rather than a list so a new
   * string documenting the same token is covered the day it is added — which is
   * exactly how the two broken ones got in.
   */
  it('has no unescaped landing_page token in any message', () => {
    const offenders: string[] = [];
    for (const [locale, messages] of [
      ['en', en],
      ['he', he],
    ] as const) {
      for (const [namespace, entries] of Object.entries(messages as Record<string, unknown>)) {
        if (typeof entries !== 'object' || entries === null) continue;
        for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
          if (typeof value !== 'string') continue;
          if (value.includes('{landing_page}') && !value.includes("'{landing_page}'")) {
            offenders.push(`${locale} ${namespace}.${key}`);
          }
        }
      }
    }
    expect({ unescaped: offenders }).toEqual({ unescaped: [] });
  });
});
