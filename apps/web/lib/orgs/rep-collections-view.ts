import type { CollectionActivityType } from '@growthos/shared';

/** Translation key for a collections activity ledger entry's kind — the same "translate a fixed enum via its own key" posture `campaignSpendStatusLabelKey` establishes. */
export function collectionActivityTypeLabelKey(activityType: CollectionActivityType): string {
  switch (activityType) {
    case 'call':
      return 'activityTypeCall';
    case 'email':
      return 'activityTypeEmail';
    case 'note':
      return 'activityTypeNote';
    case 'payment_followup':
      return 'activityTypePaymentFollowup';
    case 'payment_collected':
      return 'activityTypePaymentCollected';
    default: {
      const exhaustive: never = activityType;
      throw new Error(`Unknown collection activity type "${exhaustive as string}".`);
    }
  }
}
