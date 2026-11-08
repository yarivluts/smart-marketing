'use client';

import * as React from 'react';
import { growthPilotHasPendingWork, type GrowthPilotPageData } from '@/lib/growth-pilot/view';

/** While the site is read in another tab or request, how often the page looks again. */
export const GROWTH_PILOT_POLL_MS = 5000;
/** Between units of ads work (each call already takes as long as one step). */
export const GROWTH_PILOT_STEP_MS = 1500;

export type GrowthPilotApiResult = { ok: true; data: GrowthPilotPageData | null } | { ok: false; error: string };

/** Calls a Growth Pilot route and returns the page data it answers with, or the error code. */
export async function callPilot(base: string, path: string, body?: unknown): Promise<GrowthPilotApiResult> {
  try {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const json = (await response.json().catch(() => ({}))) as GrowthPilotPageData & { error?: string; code?: string; pilot: unknown };
    if (response.status === 401) return { ok: false, error: 'unauthorized' };
    if (response.status === 403) return { ok: false, error: 'forbidden' };
    if (!response.ok) {
      if (json.error === 'provider_failed' && (json.code === 'not_configured' || json.code === 'provider_billing')) return { ok: false, error: 'ai_unavailable' };
      if (json.error === 'provider_failed' && json.code === 'quota_exceeded') return { ok: false, error: 'quota_exceeded' };
      return { ok: false, error: typeof json.error === 'string' ? json.error : 'generic' };
    }
    return { ok: true, data: json.pilot ? json : null };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

export interface GrowthPilotState {
  data: GrowthPilotPageData | null;
  setData: (data: GrowthPilotPageData | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  /** The key of the request being sent, if any (a proposal id, `pause`, `change`...). */
  busy: string | null;
  /** Whether the pilot has work the page keeps asking the server to do. */
  working: boolean;
  /** Sends a request under `key` and takes the page data it answers with; false (with the error set) when it failed. */
  run: (key: string, path: string, body?: unknown) => Promise<boolean>;
}

/**
 * The Growth Pilot page data and its requests, shared by the pilot page and a target's details page.
 * While there is work - the site being read, ads being made - it asks the server to do the next unit
 * of it; each call does one, so the page keeps asking until nothing is left. When another caller holds
 * the work (another tab), or a call fails, it looks again a little later.
 */
export function useGrowthPilot(base: string, initial: GrowthPilotPageData | null): GrowthPilotState {
  const [data, setData] = React.useState<GrowthPilotPageData | null>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (key: string, path: string, body?: unknown): Promise<boolean> => {
      setBusy(key);
      setError(null);
      const result = await callPilot(base, path, body);
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setData(result.data);
      return true;
    },
    [base],
  );

  const working = data ? data.pilot.status === 'analyzing' || growthPilotHasPendingWork(data) : false;
  React.useEffect(() => {
    if (!working) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const result = await callPilot(base, '/advance');
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else setError(result.error);
      const more = result.ok && result.data !== null && (result.data.pilot.status === 'analyzing' || growthPilotHasPendingWork(result.data));
      if (!result.ok || more) timer = setTimeout(() => void tick(), result.ok && result.data?.pilot.status !== 'analyzing' ? GROWTH_PILOT_STEP_MS : GROWTH_PILOT_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [working, base]);

  return { data, setData, error, setError, busy, working, run };
}
