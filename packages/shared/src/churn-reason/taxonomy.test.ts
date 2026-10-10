import { describe, expect, it } from 'vitest';
import { CANCELLATION_REASON_CODES, isCancellationReasonCode } from './taxonomy';

describe('isCancellationReasonCode', () => {
  it('accepts every declared taxonomy code', () => {
    for (const code of CANCELLATION_REASON_CODES) {
      expect(isCancellationReasonCode(code)).toBe(true);
    }
  });

  it('rejects a value outside the taxonomy', () => {
    expect(isCancellationReasonCode('made_up_reason')).toBe(false);
  });
});

describe('involuntary churn', () => {
  it('has its own payment_failed code rather than folding into a voluntary one', () => {
    expect(isCancellationReasonCode('payment_failed')).toBe(true);
  });
});
