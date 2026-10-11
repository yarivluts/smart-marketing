import { headers } from 'next/headers';
import { SDK_VERSION as BROWSER_SDK_VERSION } from '@growthos/browser';
import type { DeveloperGuideContext } from '@growthos/shared';
import { ingestApiUrl } from '@/lib/orgs/ingest-api-url';

/** The node SDK version, kept in step with packages/sdk-node (a test holds the two equal). */
export const NODE_SDK_VERSION = '0.1.1';

/** The GrowthOS API base (no /v1) the samples call, from the same setting the app itself uses. */
export function guideApiBase(): string {
  return ingestApiUrl()
    .replace(/\/+$/, '')
    .replace(/\/v1\/ingest$/, '');
}

/**
 * The context every Developers page renders its samples with: the real API base, this app's own
 * origin (which serves the SDKs under /sdk/v1/), and the SDK versions that origin serves.
 */
export async function developerGuideContext(): Promise<DeveloperGuideContext> {
  const configured = process.env.GROWTHOS_PUBLIC_WEB_URL;
  let appBase = configured ? configured.replace(/\/+$/, '') : '';
  if (!appBase) {
    const incoming = await headers();
    const host = incoming.get('x-forwarded-host') ?? incoming.get('host') ?? 'localhost:3000';
    const proto = incoming.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    appBase = `${proto}://${host}`;
  }
  return {
    apiBase: guideApiBase(),
    appBase,
    nodeSdkVersion: NODE_SDK_VERSION,
    browserSdkVersion: BROWSER_SDK_VERSION,
  };
}
