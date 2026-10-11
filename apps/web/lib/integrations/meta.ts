import 'server-only';
import type { MetaOAuthConfig } from '@growthos/firebase-orm-models';
import { routing } from '@/i18n/routing';

export const META_CALLBACK_PATH = '/api/integrations/meta/callback';

/**
 * The public origin Meta sends people back to. `GROWTHOS_PUBLIC_WEB_URL` pins it on Cloud Run (the
 * service answers on two hostnames and the redirect URI must match the one registered on the Meta
 * app exactly); without it, the request's own origin is used (local development).
 */
export function publicWebOrigin(requestUrl: string): string {
  const configured = process.env.GROWTHOS_PUBLIC_WEB_URL?.trim().replace(/\/+$/, '');
  return configured || new URL(requestUrl).origin;
}

/** The Meta app this deployment connects through, or null when it has none configured. */
export function metaOAuthConfig(requestUrl: string): MetaOAuthConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  const scopes = (process.env.META_OAUTH_SCOPES ?? '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  return {
    appId,
    appSecret,
    loginConfigId: process.env.META_LOGIN_CONFIG_ID?.trim() || null,
    scopes: scopes.length ? scopes : null,
    redirectUri: `${publicWebOrigin(requestUrl)}${META_CALLBACK_PATH}`,
  };
}

export function isMetaOAuthConfigured(): boolean {
  return Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim());
}

export function safeLocale(value: string | null | undefined): string {
  return value && (routing.locales as readonly string[]).includes(value) ? value : routing.defaultLocale;
}

/** The link that starts "Connect with Facebook" for an org (and optionally a project), returning to `returnTo` afterwards. */
export function metaConnectHref(params: { orgId: string; projectId?: string | null; locale: string; returnTo?: string | null }): string {
  const query = new URLSearchParams({ orgId: params.orgId, locale: params.locale });
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.returnTo) query.set('returnTo', params.returnTo);
  return `/api/integrations/meta/start?${query.toString()}`;
}
