import { describe, expect, it } from 'vitest';
import {
  classifySubscriptionMrrMovement,
  resolveTierFromMrr,
} from './mrr-movement-classifier';

describe('mrr-movement-classifier', () => {
  describe('resolveTierFromMrr', () => {
    it('maps MRR thresholds to expected plan tiers', () => {
      expect(resolveTierFromMrr(0)).toBe('Free Trial');
      expect(resolveTierFromMrr(49)).toBe('Starter ($49)');
      expect(resolveTierFromMrr(199)).toBe('Pro ($199)');
      expect(resolveTierFromMrr(650)).toBe('Enterprise ($650)');
      expect(resolveTierFromMrr(1200)).toBe('Enterprise ($650)');
    });
  });

  describe('classifySubscriptionMrrMovement', () => {
    it('classifies new subscription conversion correctly', () => {
      const result = classifySubscriptionMrrMovement({
        customerId: 'cust_101',
        currentStatus: 'active',
        previousMrr: 0,
        currentMrr: 49,
      });

      expect(result.movementType).toBe('new');
      expect(result.mrrDelta).toBe(49);
      expect(result.fromTier).toBe('Free Trial');
      expect(result.toTier).toBe('Starter ($49)');
      expect(result.direction).toBe('upgrade');
      expect(result.segment).toBe('self_serve');
    });

    it('classifies expansion upgrade with extra seats', () => {
      const result = classifySubscriptionMrrMovement({
        customerId: 'cust_102',
        accountName: 'Vanguard Legal Partners',
        previousStatus: 'active',
        currentStatus: 'active',
        previousMrr: 49,
        currentMrr: 199,
        seatCount: 6,
        previousSeatCount: 2,
      });

      expect(result.movementType).toBe('expansion');
      expect(result.mrrDelta).toBe(150);
      expect(result.fromTier).toBe('Starter ($49)');
      expect(result.toTier).toBe('Pro ($199)');
      expect(result.direction).toBe('upgrade');
      expect(result.velocityScore).toBeGreaterThanOrEqual(80);
      expect(result.triggerReason).toBe('Added 4 extra team seats');
    });

    it('classifies enterprise tier migration', () => {
      const result = classifySubscriptionMrrMovement({
        customerId: 'cust_103',
        accountName: 'Northwest Real Estate LLC',
        previousStatus: 'active',
        currentStatus: 'active',
        previousMrr: 199,
        currentMrr: 650,
      });

      expect(result.movementType).toBe('expansion');
      expect(result.direction).toBe('upgrade');
      expect(result.segment).toBe('enterprise');
      expect(result.triggerReason).toBe('Enabled SAML SSO and audit logs');
    });

    it('classifies churn when subscription cancels or drops to 0 MRR', () => {
      const result = classifySubscriptionMrrMovement({
        customerId: 'cust_104',
        previousStatus: 'active',
        currentStatus: 'canceled',
        previousMrr: 199,
        currentMrr: 0,
      });

      expect(result.movementType).toBe('churn');
      expect(result.mrrDelta).toBe(-199);
      expect(result.direction).toBe('downgrade');
      expect(result.velocityScore).toBe(15);
    });

    it('classifies reactivation after churn', () => {
      const result = classifySubscriptionMrrMovement({
        customerId: 'cust_105',
        previousStatus: 'canceled',
        currentStatus: 'active',
        previousMrr: 0,
        currentMrr: 199,
      });

      expect(result.movementType).toBe('reactivation');
      expect(result.mrrDelta).toBe(199);
      expect(result.direction).toBe('upgrade');
      expect(result.velocityScore).toBe(80);
    });

    it('classifies contraction when MRR decreases while remaining active', () => {
      const result = classifySubscriptionMrrMovement({
        customerId: 'cust_106',
        previousStatus: 'active',
        currentStatus: 'active',
        previousMrr: 650,
        currentMrr: 199,
      });

      expect(result.movementType).toBe('contraction');
      expect(result.mrrDelta).toBe(-451);
      expect(result.direction).toBe('downgrade');
    });
  });
});
