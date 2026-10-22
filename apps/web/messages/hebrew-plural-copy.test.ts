import { describe, expect, it } from 'vitest';
import he from './he.json';

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

describe('Hebrew copy speaks to the reader in the plural, like the rest of the app', () => {
  const all = strings(he);

  it('never tells the reader to retry in the singular ("נסה שוב")', () => {
    expect(all.filter((s) => /נסה שוב/.test(s))).toEqual([]);
  });

  it('keeps the onboarding wizard free of Latin "plugin" in Hebrew sentences', () => {
    const onboarding = strings((he as Record<string, unknown>).Onboarding);
    expect(onboarding.filter((s) => /\bplugin\b/.test(s))).toEqual([]);
  });
});

// Singular imperatives (בחר, הזן, בדוק, רענן, ודא, לחץ, העתק, פתח) speak to one man and clash with the
// plural "נסו" the same sentences already use. Written as escapes: Hebrew stays out of code files.
const SINGULAR_IMPERATIVES = new RegExp(
  '(?<![\\u05d0-\\u05ea])(' +
    [
      '\\u05d1\\u05d7\\u05e8',
      '\\u05d4\\u05d6\\u05df',
      '\\u05d1\\u05d3\\u05d5\\u05e7',
      '\\u05e8\\u05e2\\u05e0\\u05df',
      '\\u05d5\\u05d3\\u05d0',
      '\\u05dc\\u05d7\\u05e5',
      '\\u05d4\\u05e2\\u05ea\\u05e7',
      '\\u05e4\\u05ea\\u05d7',
    ].join('|') +
    ')(?![\\u05d0-\\u05ea])',
  'g',
);
// Ratchet: only ever goes down, as the remaining sentences are moved to the plural.
const SINGULAR_BASELINE = 17;

describe('Hebrew instructions use the plural form', () => {
  const all = strings(he);

  it('does not add new singular imperatives', () => {
    const hits = all.flatMap((s) => s.match(SINGULAR_IMPERATIVES) ?? []);
    expect(hits.length).toBeLessThanOrEqual(SINGULAR_BASELINE);
  });

  it('the signup and API key sentences are in the plural', () => {
    const auth = (he as { Auth: Record<string, string> }).Auth;
    expect(auth.weakPasswordError.match(SINGULAR_IMPERATIVES)).toBeNull();
    const keys = he as unknown as Record<string, Record<string, string>>;
    const copyKey = Object.values(keys).find((section) => section && typeof section === 'object' && 'secretShownOnceWarning' in section);
    expect(copyKey?.secretShownOnceWarning.match(SINGULAR_IMPERATIVES)).toBeNull();
  });
});

describe('Hebrew sign-in, sign-up and invite screens address the reader in the plural', () => {
  const he_ = he as unknown as Record<string, Record<string, string>>;
  // Escapes keep Hebrew out of code files: singular "your" (שלך), "you were invited" (הוזמנת),
  // "welcome back" (שובך) and the singular verbs הירשם / התחבר.
  const SINGULAR = new RegExp(
    '\\u05e9\\u05dc\\u05da|\\u05dc\\u05da\\b|\\u05d4\\u05d5\\u05d6\\u05de\\u05e0\\u05ea|\\u05e9\\u05d5\\u05d1\\u05da|' +
      '(?<![\\u05d0-\\u05ea])(\\u05d4\\u05d9\\u05e8\\u05e9\\u05dd|\\u05d4\\u05ea\\u05d7\\u05d1\\u05e8)(?![\\u05d0-\\u05ea])',
  );
  it.each([
    ['Auth', ['needAccount', 'haveAccount', 'brandBadgeTls']],
    ['OrgsPage', ['title']],
  ])('%s keys are plural', (section, keys) => {
    for (const k of keys) expect(he_[section][k], `${section}.${k}`).not.toMatch(SINGULAR);
  });

  it('the organization list heading, loading text and invite screen are plural', () => {
    const hits: string[] = [];
    for (const [section, values] of Object.entries(he_)) {
      for (const [k, v] of Object.entries(values)) {
        if (
          typeof v === 'string' &&
          ['organizationsHeading', 'loadingOrganizations', 'signInToAccept', 'signUpToAccept', 'welcome'].includes(k) &&
          SINGULAR.test(v)
        ) {
          hits.push(`${section}.${k}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
