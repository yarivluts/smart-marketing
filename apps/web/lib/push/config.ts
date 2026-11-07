/**
 * Browser push (VAPID) configuration. Both keys come from Secret Manager
 * (`web-push-vapid-public-key` / `web-push-vapid-private-key`) mounted on the Cloud Run service as
 * `WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY`. Without them push is "not set up":
 * the settings page says so, the visit prompt stays hidden, and nothing is sent.
 */
export interface WebPushConfig {
  publicKey: string;
  privateKey: string;
  /** Who runs the sender, for the push services: a mailto: or https: address. */
  subject: string;
}

const FALLBACK_SUBJECT = 'mailto:yariv.luts@gmail.com';

function vapidSubject(env: NodeJS.ProcessEnv): string {
  const explicit = env.WEB_PUSH_VAPID_SUBJECT?.trim();
  if (explicit && /^(mailto:|https:\/\/)/.test(explicit)) return explicit;
  const site = env.GROWTHOS_PUBLIC_WEB_URL?.trim().replace(/\/+$/, '');
  if (site && site.startsWith('https://')) return site;
  return FALLBACK_SUBJECT;
}

export function resolveWebPushConfig(env: NodeJS.ProcessEnv = process.env): WebPushConfig | null {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: vapidSubject(env) };
}

/** What the browser needs to subscribe: never the private key. */
export function publicWebPushConfig(env: NodeJS.ProcessEnv = process.env): { configured: boolean; publicKey: string | null } {
  const config = resolveWebPushConfig(env);
  return { configured: config !== null, publicKey: config?.publicKey ?? null };
}
