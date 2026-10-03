import type { SubscriptionStateChangeEvent } from '../subscription-state-change';

export const subscriptionStateChangeFixtures: {
  newSubscription: SubscriptionStateChangeEvent;
  created: SubscriptionStateChangeEvent;
  planUpgrade: SubscriptionStateChangeEvent;
  planDowngrade: SubscriptionStateChangeEvent;
  cancellation: SubscriptionStateChangeEvent;
  paymentFailed: SubscriptionStateChangeEvent;
  trialConverted: SubscriptionStateChangeEvent;
  reactivate: SubscriptionStateChangeEvent;
} = {
  newSubscription: {
    eventId: 'evt_sub_create_001',
    event: 'subscription_state_change',
    ts: '2026-09-01T10:00:00.000Z',
    customerId: 'cust_acme_corp',
    properties: {
      subscriptionId: 'sub_stripe_1001',
      currentStatus: 'active',
      changeType: 'new',
      mrrDeltaCents: 9900,
      currentMrrCents: 9900,
      currency: 'USD',
      planInterval: 'month',
      planId: 'plan_growth_monthly',
      planName: 'Growth Monthly Plan',
      provider: 'stripe',
      metadata: {
        billingCycleAnchor: '2026-09-01T10:00:00.000Z',
        salesAssisted: false,
      },
    },
  },

  get created() {
    return this.newSubscription;
  },

  planUpgrade: {
    eventId: 'evt_sub_upgrade_002',
    event: 'subscription_state_change',
    ts: '2026-09-02T14:30:00.000Z',
    customerId: 'cust_acme_corp',
    properties: {
      subscriptionId: 'sub_stripe_1001',
      previousStatus: 'active',
      currentStatus: 'active',
      changeType: 'upgrade',
      mrrDeltaCents: 20000,
      currentMrrCents: 29900,
      currency: 'USD',
      planInterval: 'month',
      planId: 'plan_enterprise_monthly',
      planName: 'Enterprise Monthly Plan',
      provider: 'stripe',
      metadata: {
        seats: 25,
      },
    },
  },

  planDowngrade: {
    eventId: 'evt_sub_downgrade_003',
    event: 'subscription_state_change',
    ts: '2026-09-02T15:00:00.000Z',
    customerId: 'cust_globex_inc',
    properties: {
      subscriptionId: 'sub_stripe_2002',
      previousStatus: 'active',
      currentStatus: 'active',
      changeType: 'downgrade',
      mrrDeltaCents: -20000,
      currentMrrCents: 9900,
      currency: 'USD',
      planInterval: 'month',
      planId: 'plan_starter_monthly',
      planName: 'Starter Monthly Plan',
      provider: 'stripe',
    },
  },

  cancellation: {
    eventId: 'evt_sub_cancel_004',
    event: 'subscription_state_change',
    ts: '2026-09-02T16:15:00.000Z',
    customerId: 'cust_initech_llc',
    properties: {
      subscriptionId: 'sub_stripe_3003',
      previousStatus: 'active',
      currentStatus: 'canceled',
      changeType: 'cancellation',
      mrrDeltaCents: -9900,
      currentMrrCents: 0,
      currency: 'USD',
      planInterval: 'month',
      planId: 'plan_growth_monthly',
      cancellationReasonCode: 'too_expensive',
      cancellationComment: 'Downsizing team budget for marketing software',
      provider: 'stripe',
    },
  },

  paymentFailed: {
    eventId: 'evt_sub_failed_005',
    event: 'subscription_state_change',
    ts: '2026-09-02T17:00:00.000Z',
    customerId: 'cust_soylent_corp',
    properties: {
      subscriptionId: 'sub_stripe_4004',
      previousStatus: 'active',
      currentStatus: 'past_due',
      changeType: 'payment_failed',
      mrrDeltaCents: 0,
      currentMrrCents: 14900,
      currency: 'USD',
      planInterval: 'month',
      planId: 'plan_pro_monthly',
      provider: 'stripe',
      metadata: {
        attemptCount: 2,
        nextRetry: '2026-09-05T17:00:00.000Z',
      },
    },
  },

  trialConverted: {
    eventId: 'evt_sub_convert_006',
    event: 'subscription_state_change',
    ts: '2026-09-02T12:00:00.000Z',
    customerId: 'cust_umbrella_corp',
    properties: {
      subscriptionId: 'sub_chargebee_5005',
      previousStatus: 'trialing',
      currentStatus: 'active',
      changeType: 'trial_convert',
      mrrDeltaCents: 19900,
      currentMrrCents: 19900,
      currency: 'USD',
      planInterval: 'month',
      planId: 'plan_scale_monthly',
      provider: 'chargebee',
    },
  },

  reactivate: {
    eventId: 'evt_sub_reactivate_007',
    event: 'subscription_state_change',
    ts: '2026-09-02T13:45:00.000Z',
    customerId: 'cust_massive_dynamic',
    properties: {
      subscriptionId: 'sub_stripe_6006',
      previousStatus: 'canceled',
      currentStatus: 'active',
      changeType: 'reactivate',
      mrrDeltaCents: 9900,
      currentMrrCents: 9900,
      currency: 'USD',
      planInterval: 'month',
      planId: 'plan_growth_monthly',
      provider: 'stripe',
    },
  },
};
