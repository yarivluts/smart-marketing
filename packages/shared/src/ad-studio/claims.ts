/**
 * Claims in ad copy that nothing we were given supports (the product rule: never invent data).
 *
 * A number, percentage or price, or a promise word ("free", "guaranteed", "best"), is flagged unless
 * the same thing appears in the sources - the brief, the objective, the landing-page summary. It is a
 * prompt for a person to check, not a block: the person may know the claim is true.
 */

/** Promise words, matched case-insensitively. Hebrew forms are escapes (code files hold no Hebrew). */
const CLAIM_WORDS = [
  'free',
  'guarantee',
  'guaranteed',
  'best',
  'cheapest',
  'fastest',
  'number one',
  '#1',
  'discount',
  'sale',
  'exclusive',
  'only',
  '\u05d7\u05d9\u05e0\u05dd',
  '\u05de\u05d5\u05d1\u05d8\u05d7',
  '\u05d4\u05db\u05d9',
  '\u05d4\u05d8\u05d5\u05d1 \u05d1\u05d9\u05d5\u05ea\u05e8',
  '\u05d4\u05e0\u05d7\u05d4',
  '\u05de\u05d1\u05e6\u05e2',
  '\u05d1\u05dc\u05e2\u05d3\u05d9',
];

const NUMBER = /[$₪€£]?\d+(?:[.,]\d+)?\s?(?:%|₪|\$|€)?/gu;

function digitsOf(token: string): string {
  return token.replace(/[^\d.,]/g, '').replace(/[.,]$/, '');
}

function containsWord(haystack: string, word: string): boolean {
  if (/^[a-z# ]+$/i.test(word)) return new RegExp(`(^|[^a-z])${word.replace(/[#]/g, '\\#')}([^a-z]|$)`, 'i').test(haystack);
  return haystack.includes(word);
}

/** The claims in `text` that none of `sources` contains, each once, in the order they appear. */
export function findUnverifiedClaims(text: string, sources: readonly string[]): string[] {
  const source = sources.join('\n').toLowerCase();
  const sourceNumbers = new Set((source.match(NUMBER) ?? []).map(digitsOf));
  const lower = text.toLowerCase();
  const found: { at: number; claim: string }[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const digits = digitsOf(match[0]);
    if (digits && !sourceNumbers.has(digits)) found.push({ at: match.index ?? 0, claim: match[0].trim() });
  }
  for (const word of CLAIM_WORDS) {
    if (containsWord(lower, word) && !containsWord(source, word)) found.push({ at: lower.indexOf(word), claim: word });
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((entry) => entry.claim))];
}
