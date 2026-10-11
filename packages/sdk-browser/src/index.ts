import {
  GrowthOSBrowser,
  type Consent,
  type GrowthOSBrowserOptions,
  type Properties,
} from './client';

export { GrowthOSBrowser, DEFAULT_API, SDK_VERSION, VISIT_TIMEOUT_MS } from './client';
export { installSnippet, type InstallSnippetOptions } from './snippet';
export type {
  Consent,
  GrowthOSBrowserOptions,
  Properties,
  QueuedEvent,
  SendResult,
} from './client';

let instance: GrowthOSBrowser | null = null;

/**
 * Starts GrowthOS on this page (once; a second call is ignored). With the npm package:
 *
 * ```ts
 * import { init, track, identify, getAnonId } from '@growthos/browser';
 * init({ key: 'gos_pk_live_...' });
 * ```
 */
export function init(options: GrowthOSBrowserOptions): GrowthOSBrowser {
  if (!instance) instance = new GrowthOSBrowser(options);
  return instance;
}

function current(): GrowthOSBrowser | null {
  if (!instance && typeof console !== 'undefined')
    console.warn('[GrowthOS] call init({ key }) first');
  return instance;
}

export const track = (
  event: string,
  properties?: Properties,
  options?: { eventId?: string },
): void => current()?.track(event, properties, options);
export const page = (properties?: Properties): void => current()?.page(properties);
export const identify = (customerId: string): void => current()?.identify(customerId);
export const reset = (): void => current()?.reset();
export const consent = (state: Consent): void => current()?.consent(state);
export const getAnonId = (): string | null => current()?.getAnonId() ?? null;
export const getAttribution = (): Properties => current()?.getAttribution() ?? {};
export const flush = (): Promise<unknown> => current()?.flush() ?? Promise.resolve(null);
export const verify = (expect?: string[]): Promise<unknown> =>
  current()?.verify(expect) ?? Promise.resolve(null);
