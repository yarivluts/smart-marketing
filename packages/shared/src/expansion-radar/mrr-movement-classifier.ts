import {
  ClassifyMrrMovementInput,
  MrrMovementClassification,
  MrrMovementType,
  TierMovementDirection,
  AccountSegment,
} from './types';

const TIER_ORDER: Record<string, number> = {
  'Free Trial': 0,
  'Starter ($49)': 1,
  'Pro ($199)': 2,
  'Enterprise ($650)': 3,
};

export function resolveTierFromMrr(mrr: number): string {
  if (mrr <= 0) return 'Free Trial';
  if (mrr < 150) return 'Starter ($49)';
  if (mrr < 500) return 'Pro ($199)';
  return 'Enterprise ($650)';
}

export function classifySubscriptionMrrMovement(
  input: ClassifyMrrMovementInput,
): MrrMovementClassification {
  const previousMrr = Math.max(0, input.previousMrr || 0);
  const currentMrr = Math.max(0, input.currentMrr || 0);
  const mrrDelta = currentMrr - previousMrr;

  const fromTier = input.previousTier || resolveTierFromMrr(previousMrr);
  const toTier = input.currentTier || resolveTierFromMrr(currentMrr);

  const fromOrder = TIER_ORDER[fromTier] ?? 0;
  const toOrder = TIER_ORDER[toTier] ?? 0;

  let direction: TierMovementDirection = 'lateral';
  if (toOrder > fromOrder || (toOrder === fromOrder && mrrDelta > 0)) {
    direction = 'upgrade';
  } else if (toOrder < fromOrder || (toOrder === fromOrder && mrrDelta < 0)) {
    direction = 'downgrade';
  }

  // Determine movement type
  let movementType: MrrMovementType;
  const isCanceled = input.currentStatus === 'canceled' || currentMrr === 0;

  if (previousMrr > 0 && isCanceled) {
    movementType = 'churn';
  } else if (
    input.previousStatus &&
    input.previousStatus !== 'active' &&
    input.previousStatus !== 'trialing' &&
    input.currentStatus === 'active' &&
    currentMrr > 0
  ) {
    movementType = 'reactivation';
  } else if (previousMrr === 0 && currentMrr > 0) {
    movementType = 'new';
  } else if (mrrDelta > 0) {
    movementType = 'expansion';
  } else {
    movementType = 'contraction';
  }

  // Determine segment
  const isEnterprise =
    toTier.includes('Enterprise') ||
    currentMrr >= 500 ||
    (input.seatCount !== undefined && input.seatCount >= 50);
  const segment: AccountSegment = isEnterprise ? 'enterprise' : 'self_serve';

  // Calculate expansion velocity score (0 to 100)
  let velocityScore = 50;
  if (movementType === 'expansion' || movementType === 'new') {
    const deltaRatio = previousMrr > 0 ? mrrDelta / previousMrr : 1;
    const mrrFactor = Math.min(30, Math.floor(deltaRatio * 20));
    const tierBonus = toOrder > fromOrder ? (toOrder - fromOrder) * 15 : 5;
    const seatBonus =
      input.seatCount && input.previousSeatCount && input.seatCount > input.previousSeatCount
        ? Math.min(20, (input.seatCount - input.previousSeatCount) * 4)
        : 0;
    velocityScore = Math.min(98, 55 + mrrFactor + tierBonus + seatBonus);
  } else if (movementType === 'churn') {
    velocityScore = 15;
  } else if (movementType === 'contraction') {
    velocityScore = 30;
  } else if (movementType === 'reactivation') {
    velocityScore = 80;
  }

  // Infer trigger reason if not specified
  let triggerReason = input.triggerReason;
  if (!triggerReason) {
    if (toTier.includes('Enterprise') && fromTier !== toTier) {
      triggerReason = 'Enabled SAML SSO and audit logs';
    } else if (
      input.seatCount &&
      input.previousSeatCount &&
      input.seatCount > input.previousSeatCount
    ) {
      const added = input.seatCount - input.previousSeatCount;
      triggerReason = `Added ${added} extra team seats`;
    } else if (movementType === 'expansion') {
      triggerReason = 'Hit monthly document & usage velocity limit';
    } else if (movementType === 'churn') {
      triggerReason = 'Subscription cancellation request';
    } else if (movementType === 'reactivation') {
      triggerReason = 'Reactivated workspace with expanded seats';
    } else {
      triggerReason = 'Plan tier synchronization';
    }
  }

  return {
    movementType,
    fromTier,
    toTier,
    mrrDelta,
    direction,
    segment,
    velocityScore,
    triggerReason,
  };
}
