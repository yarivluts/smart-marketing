import { describe, expect, it } from 'vitest';
import { validateCanonicalEvent } from '../validator';
import { validateAdSpend } from '../ad-spend';
import { validateSubscriptionStateChange } from '../subscription-state-change';

describe('Clock-Skew Checks & Negative Spend Quarantine', () => {
  const referenceTime = '2026-09-02T12:00:00.000Z'; // Now is Sep 2, 2026 12:00:00 UTC

  describe('Clock-skew validation', () => {
    const baseSubscriptionPayload = {
      eventId: 'evt_skew_001',
      event: 'subscription_state_change',
      ts: referenceTime,
      customerId: 'cust_skew_test',
      properties: {
        subscriptionId: 'sub_skew_001',
        currentStatus: 'active',
        changeType: 'new',
        mrrDeltaCents: 5000,
        currentMrrCents: 5000,
        currency: 'USD',
        planInterval: 'month',
        planId: 'plan_pro',
      },
    };

    it('passes for timestamps within valid window (e.g. 1 hour ago, 2 hours future within 1 day)', () => {
      // 1 hour ago
      const resPast = validateSubscriptionStateChange(
        { ...baseSubscriptionPayload, ts: '2026-09-02T11:00:00.000Z' },
        { now: referenceTime }
      );
      expect(resPast.valid).toBe(true);

      // 2 hours in the future (< 24h)
      const resFuture = validateSubscriptionStateChange(
        { ...baseSubscriptionPayload, ts: '2026-09-02T14:00:00.000Z' },
        { now: referenceTime }
      );
      expect(resFuture.valid).toBe(true);
    });

    it('flags CLOCK_SKEW_FUTURE when timestamp exceeds maxFutureSkewSeconds (default 24 hours)', () => {
      // 3 days into the future
      const futureTime = '2026-09-05T12:00:00.000Z';
      const res = validateSubscriptionStateChange(
        { ...baseSubscriptionPayload, ts: futureTime },
        { now: referenceTime }
      );
      expect(res.valid).toBe(false);
      expect(res.errors?.some((e) => e.code === 'CLOCK_SKEW_FUTURE')).toBe(true);
      expect(res.errors?.find((e) => e.code === 'CLOCK_SKEW_FUTURE')?.message).toContain('too far in the future');
    });

    it('flags CLOCK_SKEW_PAST when timestamp is older than maxPastSkewSeconds (default 365 days)', () => {
      // 2 years ago (2024-09-02)
      const pastTime = '2024-09-02T12:00:00.000Z';
      const res = validateSubscriptionStateChange(
        { ...baseSubscriptionPayload, ts: pastTime },
        { now: referenceTime }
      );
      expect(res.valid).toBe(false);
      expect(res.errors?.some((e) => e.code === 'CLOCK_SKEW_PAST')).toBe(true);
      expect(res.errors?.find((e) => e.code === 'CLOCK_SKEW_PAST')?.message).toContain('too far in the past');
    });

    it('respects custom skew thresholds in ValidationOptions', () => {
      // Allow only 60 seconds future skew
      const future300s = '2026-09-02T12:05:00.000Z';
      const resStrict = validateSubscriptionStateChange(
        { ...baseSubscriptionPayload, ts: future300s },
        { now: referenceTime, maxFutureSkewSeconds: 60 }
      );
      expect(resStrict.valid).toBe(false);
      expect(resStrict.errors?.some((e) => e.code === 'CLOCK_SKEW_FUTURE')).toBe(true);

      // Relax past skew to 5 years (157,680,000s)
      const past3Years = '2023-09-02T12:00:00.000Z';
      const resRelaxed = validateSubscriptionStateChange(
        { ...baseSubscriptionPayload, ts: past3Years },
        { now: referenceTime, maxPastSkewSeconds: 200000000 }
      );
      expect(resRelaxed.valid).toBe(true);
    });
  });

  describe('Negative Spend Quarantine', () => {
    const baseSpend = {
      measure: 'ad_spend',
      ts: '2026-09-02',
      value: 100.0,
      dimensions: {
        channelId: 'meta_ads',
        campaignId: 'camp_meta_001',
        currency: 'USD',
      },
    };

    it('accepts zero or positive spend amounts', () => {
      const resPositive = validateAdSpend(baseSpend, { now: referenceTime });
      expect(resPositive.valid).toBe(true);
      expect(resPositive.quarantined).toBeUndefined();

      const resZero = validateAdSpend({ ...baseSpend, value: 0 }, { now: referenceTime });
      expect(resZero.valid).toBe(true);
    });

    it('quarantines negative spend records with clear error diagnostics and quarantine flag', () => {
      const resNegative = validateAdSpend(
        { ...baseSpend, value: -450.25 },
        { now: referenceTime }
      );

      expect(resNegative.valid).toBe(false);
      expect(resNegative.quarantined).toBe(true);
      expect(resNegative.quarantineReason).toBe('Negative spend amount detected: -450.25');
      expect(resNegative.errors?.some((e) => e.code === 'NEGATIVE_SPEND')).toBe(true);
    });

    it('works when invoked through general validateCanonicalEvent router', () => {
      const resRouter = validateCanonicalEvent(
        'ad_spend',
        { ...baseSpend, value: -99.99 },
        { now: referenceTime }
      );

      expect(resRouter.valid).toBe(false);
      expect(resRouter.quarantined).toBe(true);
      expect(resRouter.quarantineReason).toContain('-99.99');
      expect(resRouter.errors?.some((e) => e.code === 'NEGATIVE_SPEND')).toBe(true);
    });
  });
});
