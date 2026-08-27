import { describe, expect, it } from 'vitest';
import type { FunnelStepResult } from '@growthos/firebase-orm-models';
import { buildFunnelView, toFunnelStepView } from './funnel-view';

function step(overrides: Partial<FunnelStepResult> & Pick<FunnelStepResult, 'stageKey' | 'stepOrder'>): FunnelStepResult {
  return { customerCount: 0, conversionRateFromFirst: 0, ...overrides };
}

describe('toFunnelStepView', () => {
  it('rounds the raw conversion fraction to a whole-number percentage', () => {
    expect(toFunnelStepView(step({ stageKey: 'activation', stepOrder: 1, customerCount: 40, conversionRateFromFirst: 0.4 }))).toEqual({
      stageKey: 'activation',
      stepOrder: 1,
      customerCount: 40,
      conversionPercent: 40,
    });
  });

  it('rounds rather than truncates (0.405 -> 41, not 40)', () => {
    const view = toFunnelStepView(step({ stageKey: 'conversion', stepOrder: 2, customerCount: 1, conversionRateFromFirst: 0.405 }));
    expect(view.conversionPercent).toBe(41);
  });

  it('renders 100% for a first step (conversion rate 1)', () => {
    const view = toFunnelStepView(step({ stageKey: 'signup', stepOrder: 0, customerCount: 10, conversionRateFromFirst: 1 }));
    expect(view.conversionPercent).toBe(100);
  });
});

describe('buildFunnelView', () => {
  it('maps an ok outcome with steps to the ok view kind, in order', () => {
    const view = buildFunnelView({
      ok: true,
      steps: [
        { stageKey: 'signup', stepOrder: 0, customerCount: 10, conversionRateFromFirst: 1 },
        { stageKey: 'activation', stepOrder: 1, customerCount: 4, conversionRateFromFirst: 0.4 },
      ],
    });

    expect(view).toEqual({
      kind: 'ok',
      steps: [
        { stageKey: 'signup', stepOrder: 0, customerCount: 10, conversionPercent: 100 },
        { stageKey: 'activation', stepOrder: 1, customerCount: 4, conversionPercent: 40 },
      ],
    });
  });

  it('maps an ok outcome with no steps to "no_funnel" — nothing confirmed yet, not a failure', () => {
    expect(buildFunnelView({ ok: true, steps: [] })).toEqual({ kind: 'no_funnel' });
  });

  it('maps each degraded outcome reason to its own render kind, same as buildCustomerSearchView', () => {
    expect(buildFunnelView({ ok: false, reason: 'warehouse_not_configured', message: 'not configured yet' })).toEqual({
      kind: 'warehouse_not_configured',
    });
    expect(buildFunnelView({ ok: false, reason: 'quota_exceeded', message: 'quota is spent' })).toEqual({ kind: 'quota_exceeded' });
    expect(buildFunnelView({ ok: false, reason: 'query_error', message: 'table not found' })).toEqual({ kind: 'query_error' });
  });
});
