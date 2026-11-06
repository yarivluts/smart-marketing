import { isIP } from 'node:net';

/**
 * The hard safety rules of the product walkthrough recorder, in code and independent of whatever the
 * AI guide suggests: what may never be clicked, which sites the browser may move to, and which
 * requests it may make. Pure, so every rule is unit-tested.
 */

/**
 * English words that mean the click would change or leave the account: deleting, signing out,
 * paying, inviting, sending, publishing, saving. Matched as whole words in the element's text,
 * accessible name and link address (where `-`, `_` and `/` count as spaces).
 */
const DENY_ENGLISH =
  /\b(delete|deletion|remove|log\s?out|logout|log\s?off|sign\s?out|signout|cancel|billing|payments?|pay|purchase|buy|checkout|upgrade|downgrade|subscriptions?|subscribe|unsubscribe|plans?\s?&?\s?pricing|invite|send|share|publish|archive|reset|deactivate|disable|close\s?account|transfer|withdraw|save|submit|confirm|approve|import|export|download|upload|install|uninstall|connect|disconnect)\b/i;

/**
 * Hebrew equivalents (written as escapes: no Hebrew in code files). Matched anywhere in the text,
 * since Hebrew attaches prefixes such as "and"/"the" to the word: delete, remove, log out, exit,
 * cancel, payment, charge, purchase, buy, upgrade, invite/order, send, publish, archive, reset,
 * save, subscription.
 */
const DENY_HEBREW = [
  'מחק', // delete (verb)
  'מחיקה', // deletion
  'הסר', // remove
  'התנתק', // log out
  'יציאה', // exit
  'ביטול', // cancellation
  'בטל', // cancel
  'תשלום', // payment
  'חיוב', // charge
  'רכישה', // purchase
  'קנה', // buy
  'שדרג', // upgrade (verb)
  'שדרוג', // upgrade
  'הזמ', // invite / order
  'שלח', // send
  'שליחה', // sending
  'פרסם', // publish
  'פרסום', // publishing
  'ארכיון', // archive
  'איפוס', // reset
  'שמור', // save
  'שמירה', // saving
  'מנוי', // subscription
];

/** True when the element's words say clicking it could change, pay for or leave the account. */
export function isDeniedElement(element: { name: string; href?: string | null }): boolean {
  const href = element.href ? safeDecode(element.href).replace(/[-_/.?=&#+%]+/g, ' ') : '';
  const text = `${element.name} ${href}`;
  if (DENY_ENGLISH.test(text)) return true;
  return DENY_HEBREW.some((word) => text.includes(word));
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Second-level labels under which a registrable domain takes three labels (co.il, com.au, ...). */
const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'muni', 'ltd', 'plc', 'gob', 'or', 'ne', 'go']);

/**
 * The registrable domain of a host ("app.example.co.il" -> "example.co.il"), close enough for the
 * same-site rule without a public suffix list: two labels, or three under a common second level of a
 * country code. An IP address is its own site.
 */
export function registrableDomain(host: string): string {
  const clean = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(clean)) return clean;
  const labels = clean.split('.');
  if (labels.length <= 2) return clean;
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  if (tld.length === 2 && SECOND_LEVEL.has(second)) return labels.slice(-3).join('.');
  return labels.slice(-2).join('.');
}

export function siteOf(rawUrl: string): string | null {
  try {
    return registrableDomain(new URL(rawUrl).hostname);
  } catch {
    return null;
  }
}

/** Whether a URL belongs to one of the allowed sites. */
export function isSameSite(rawUrl: string, sites: ReadonlySet<string>): boolean {
  const site = siteOf(rawUrl);
  return site !== null && sites.has(site);
}

export interface DemoRequest {
  url: string;
  method: string;
  /** A top-level (main frame) navigation. */
  isNavigation: boolean;
}

export type DemoRequestDecision = 'allow' | 'block';

/**
 * The browser's request rule:
 * - `data:`/`blob:`/`about:` are local and allowed.
 * - Every other request must pass the address guard (public https; cached per host by the caller).
 * - Before sign-in finishes, the login flow may navigate wherever the guard allows (sign-in
 *   providers redirect). After it, a top-level navigation must stay on an allowed site and be a GET:
 *   no form is ever submitted.
 */
export async function decideDemoRequest(
  request: DemoRequest,
  state: { loggedIn: boolean; sites: ReadonlySet<string> },
  addressAllowed: (url: string) => Promise<boolean>,
): Promise<DemoRequestDecision> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return 'block';
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') return 'allow';
  if (state.loggedIn && request.isNavigation) {
    if (request.method.toUpperCase() !== 'GET') return 'block';
    if (!isSameSite(request.url, state.sites)) return 'block';
  }
  return (await addressAllowed(request.url)) ? 'allow' : 'block';
}

/** Caches the (DNS-resolving) address check per origin for one recording. */
export function cachedAddressCheck(check: (url: string) => Promise<void>): (url: string) => Promise<boolean> {
  const cache = new Map<string, Promise<boolean>>();
  return (rawUrl) => {
    let key: string;
    try {
      key = new URL(rawUrl).origin;
    } catch {
      return Promise.resolve(false);
    }
    let result = cache.get(key);
    if (!result) {
      result = check(rawUrl).then(
        () => true,
        () => false,
      );
      cache.set(key, result);
    }
    return result;
  };
}
