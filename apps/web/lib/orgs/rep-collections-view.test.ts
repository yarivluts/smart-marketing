import { describe, expect, it } from 'vitest';
import { collectionActivityTypeLabelKey } from './rep-collections-view';

describe('collectionActivityTypeLabelKey', () => {
  it.each([
    ['call', 'activityTypeCall'],
    ['email', 'activityTypeEmail'],
    ['note', 'activityTypeNote'],
    ['payment_followup', 'activityTypePaymentFollowup'],
    ['payment_collected', 'activityTypePaymentCollected'],
  ] as const)('maps %s -> %s', (activityType, expected) => {
    expect(collectionActivityTypeLabelKey(activityType)).toBe(expected);
  });
});
