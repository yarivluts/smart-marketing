import { describe, expect, it, vi } from 'vitest';

describe('the script-tag build', () => {
  it('replays the calls the install snippet recorded before it loaded, in order, then serves window.GrowthOS', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const sent: { event: string }[][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const batch = (JSON.parse(String(init.body)) as { batch: { event: string }[] }).batch;
        sent.push(batch);
        return new Response(
          JSON.stringify({ accepted: batch.length, quarantined: 0, duplicates: 0, rejected: [] }),
          { status: 202 },
        );
      }),
    );
    // What the snippet leaves behind: a stub queue.
    const queue: [string, unknown[]][] = [
      ['init', [{ key: 'gos_pk_test_x', api: 'https://api.test', flushIntervalMs: 0 }]],
      ['track', ['cta_click', { cta: 'hero' }]],
    ];
    (window as unknown as { GrowthOS: unknown }).GrowthOS = { q: queue };
    await import('./global');
    const growthos = (
      window as unknown as {
        GrowthOS: {
          track: (event: string) => void;
          flush: () => Promise<unknown>;
          getAnonId: () => string;
        };
      }
    ).GrowthOS;
    growthos.track('cta_click');
    await growthos.flush();
    expect(sent.flat().map((event) => event.event)).toEqual([
      'touchpoint',
      'cta_click',
      'cta_click',
    ]);
    expect(growthos.getAnonId()).toEqual(expect.any(String));
    vi.unstubAllGlobals();
  });
});
