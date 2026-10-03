import type { CustomerTransactionEvent } from '../customer-transaction';

export const customerTransactionFixtures: {
  initialPurchase: CustomerTransactionEvent;
  recurringRenewal: CustomerTransactionEvent;
  planUpgradeCharge: CustomerTransactionEvent;
  addonPayment: CustomerTransactionEvent;
  refundTransaction: CustomerTransactionEvent;
  failedCharge: CustomerTransactionEvent;
} = {
  initialPurchase: {
    eventId: 'evt_tx_init_001',
    event: 'customer_transaction',
    ts: '2026-09-01T10:05:00.000Z',
    customerId: 'cust_acme_corp',
    properties: {
      transactionId: 'ch_stripe_init_1001',
      transactionType: 'first_charge',
      status: 'succeeded',
      amountCents: 12000,
      currency: 'USD',
      paymentMethod: 'card',
      invoiceId: 'in_stripe_1001',
      subscriptionId: 'sub_stripe_1001',
      provider: 'stripe',
      billingEmail: 'billing@acmecorp.com',
      metadata: {
        cardBrand: 'visa',
        last4: '4242',
      },
    },
  },

  recurringRenewal: {
    eventId: 'evt_tx_renew_002',
    event: 'customer_transaction',
    ts: '2026-09-02T00:00:00.000Z',
    customerId: 'cust_globex_inc',
    properties: {
      transactionId: 'ch_stripe_renew_2002',
      transactionType: 'recurring_renewal',
      status: 'succeeded',
      amountCents: 9900,
      currency: 'USD',
      paymentMethod: 'card',
      invoiceId: 'in_stripe_2002',
      subscriptionId: 'sub_stripe_2002',
      provider: 'stripe',
      billingEmail: 'accounts@globex.com',
    },
  },

  planUpgradeCharge: {
    eventId: 'evt_tx_upgrade_003',
    event: 'customer_transaction',
    ts: '2026-09-02T14:32:00.000Z',
    customerId: 'cust_acme_corp',
    properties: {
      transactionId: 'ch_stripe_upg_3003',
      transactionType: 'plan_upgrade',
      status: 'succeeded',
      amountCents: 20000,
      currency: 'USD',
      paymentMethod: 'card',
      invoiceId: 'in_stripe_3003',
      subscriptionId: 'sub_stripe_1001',
      provider: 'stripe',
      billingEmail: 'billing@acmecorp.com',
    },
  },

  addonPayment: {
    eventId: 'evt_tx_addon_004',
    event: 'customer_transaction',
    ts: '2026-09-02T11:20:00.000Z',
    customerId: 'cust_cyberdyne',
    properties: {
      transactionId: 'ch_paypal_addon_4004',
      transactionType: 'addon_payment',
      status: 'succeeded',
      amountCents: 3500,
      currency: 'USD',
      paymentMethod: 'paypal',
      provider: 'custom',
      billingEmail: 'finance@cyberdyne.io',
      metadata: {
        addonName: 'Extra 10k AI Tokens Pack',
      },
    },
  },

  refundTransaction: {
    eventId: 'evt_tx_refund_005',
    event: 'customer_transaction',
    ts: '2026-09-02T16:45:00.000Z',
    customerId: 'cust_initech_llc',
    properties: {
      transactionId: 're_stripe_ref_5005',
      transactionType: 'refund',
      status: 'succeeded',
      amountCents: 9900,
      refundedAmountCents: 5000,
      currency: 'USD',
      paymentMethod: 'card',
      invoiceId: 'in_stripe_5005',
      provider: 'stripe',
      metadata: {
        reason: 'requested_by_customer',
      },
    },
  },

  failedCharge: {
    eventId: 'evt_tx_fail_006',
    event: 'customer_transaction',
    ts: '2026-09-02T17:02:00.000Z',
    customerId: 'cust_soylent_corp',
    properties: {
      transactionId: 'ch_stripe_fail_6006',
      transactionType: 'recurring_renewal',
      status: 'failed',
      amountCents: 14900,
      currency: 'USD',
      paymentMethod: 'card',
      failureCode: 'card_declined',
      failureMessage: 'Your card has insufficient funds.',
      invoiceId: 'in_stripe_6006',
      subscriptionId: 'sub_stripe_4004',
      provider: 'stripe',
      billingEmail: 'admin@soylent.com',
    },
  },
};
