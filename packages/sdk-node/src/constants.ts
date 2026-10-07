// No Node built-ins here: the relay entry (`@growthos/node/relay`) imports this module and must
// run on edge runtimes too (Cloudflare Workers / Pages, Vercel Edge, Deno).

export const DEFAULT_BASE_URL = 'https://api-prod-1098891924957.me-west1.run.app';
export const SDK_VERSION = '0.1.1';

/** `GROWTHOS_BASE_URL` when the runtime has a `process.env` (edge runtimes may have none). */
export function envBaseUrl(): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env?.GROWTHOS_BASE_URL || undefined;
}
