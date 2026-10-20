import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

describe('onboarding stat tiles', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)('%s: all four tiles have a label', (_l, messages) => {
    const o = (messages as unknown as Copy).Onboarding;
    for (const k of ['kpiEvents', 'kpiEventsSubtext', 'kpiFunnelSteps', 'kpiBoards']) {
      expect(o[k]).toBeTruthy();
    }
  });

  it('en avoids jargon: events, funnel, batches, boards', () => {
    const o = (en as unknown as Copy).Onboarding;
    const text = [o.kpiEvents, o.kpiEventsSubtext, o.kpiFunnelSteps, o.kpiBoards].join(' ');
    expect(text).not.toMatch(/event|funnel|batch|board/i);
  });

  it('he avoids the jargon "משפך" in the tile labels', () => {
    const o = (he as unknown as Copy).Onboarding;
    expect(`${o.kpiFunnelSteps} ${o.kpiEvents}`).not.toMatch(/משפך|אירוע/);
  });
});
