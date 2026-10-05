import {
  consent,
  flush,
  getAnonId,
  getAttribution,
  identify,
  init,
  page,
  reset,
  track,
  verify,
} from './index';

/**
 * The script-tag build: `window.GrowthOS`. The install snippet defines a stub that records calls
 * made before this file loads (`GrowthOS.q`); they are replayed in order, so `init()` and early
 * `track()` calls are never lost.
 */
const api = {
  init,
  track,
  page,
  identify,
  reset,
  consent,
  flush,
  getAnonId,
  getAttribution,
  verify,
};
type Api = typeof api;
type StubCall = [keyof Api, IArguments | unknown[]];

const target = window as unknown as { GrowthOS?: Partial<Api> & { q?: StubCall[] } };
const waiting = target.GrowthOS?.q ?? [];
target.GrowthOS = api;
for (const [method, args] of waiting) {
  const fn = api[method] as ((...values: unknown[]) => unknown) | undefined;
  try {
    fn?.(...Array.from(args as ArrayLike<unknown>));
  } catch (error) {
    console.error('[GrowthOS]', error);
  }
}
