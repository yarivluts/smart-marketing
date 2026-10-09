export type MrrMovementType = 'expansion' | 'contraction' | 'churn' | 'reactivation' | 'new';

export type AccountPlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export type AccountSegment = 'all' | 'self_serve' | 'enterprise';

export type TierMovementDirection = 'upgrade' | 'downgrade' | 'lateral';

export interface CustomerExpansionEvent {
  id: string;
  organizationId: string;
  projectId: string;
  environmentId?: string;
  customerId: string;
  accountName: string;
  fromTier: string;
  toTier: string;
  previousMrr: number;
  currentMrr: number;
  mrrDelta: number;
  movementType: MrrMovementType;
  direction?: TierMovementDirection;
  segment: AccountSegment;
  velocityScore: number;
  triggerReason: string;
  recordedAt: string;
  timeAgo?: string;
}

export interface CustomerExpansionSummary {
  highExpansionPotentialCount: number;
  potentialMrrLift: number;
  avgExpansionSpeedDays: number;
  largeTeamAccountsCount: number;
  upgradePenetrationRate: number;
  tierDistribution: {
    free: number;
    starter: number;
    pro: number;
    enterprise: number;
  };
  recentEvents: CustomerExpansionEvent[];
}

export interface ClassifyMrrMovementInput {
  customerId: string;
  accountName?: string;
  previousStatus?: string;
  currentStatus: string;
  previousMrr: number;
  currentMrr: number;
  previousTier?: string;
  currentTier?: string;
  seatCount?: number;
  previousSeatCount?: number;
  triggerReason?: string;
}

export interface MrrMovementClassification {
  movementType: MrrMovementType;
  fromTier: string;
  toTier: string;
  mrrDelta: number;
  direction: TierMovementDirection;
  segment: AccountSegment;
  velocityScore: number;
  triggerReason: string;
}
