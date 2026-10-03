import { describe, expect, it } from 'vitest';
import {
  validateSubscriptionStateChange,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_CHANGE_TYPES,
  PLAN_INTERVALS,
} from '../subscription-state-change';
import {
  validateCustomerTransaction,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../customer-transaction';
import {
  validateAdSpend,
  AD_CHANNEL_IDS,
} from '../ad-spend';
import {
  validateProductTelemetry,
  TELEMETRY_PLATFORMS,
} from '../product-telemetry';
import {
  validateCrmLifecycle,
  CRM_STAGES,
} from '../crm-lifecycle';

describe('Canonical Schemas - subscription_state_change', () => {
  const validBase = {
    eventId: 'evt_sub_01',
    event: 'subscription_state_change',
    ts: '2026-09-02T12:00:00.000Z',
    customerId: 'cust_test_1',
    properties: {
      subscriptionId: 'sub_123',
      currentStatus: 'active',
      changeType: 'new',
      mrrDeltaCents: 5000,
      currentMrrCents: 5000,
      currency: 'USD',
      planInterval: 'month',
      planId: 'plan_starter',
    },
  };

  it('validates a correct subscription state change payload', () => {
    const res = validateSubscriptionStateChange(validBase, { now: '2026-09-02T12:00:00.000Z' });
    expect(res.valid).toBe(true);
    expect(res.errors).toBeUndefined();
    expect(res.data?.properties.mrrDeltaCents).toBe(5000);
    expect(res.data?.properties.currency).toBe('USD');
  });

  it('rejects non-object or null payloads', () => {
    expect(validateSubscriptionStateChange(null).valid).toBe(false);
    expect(validateSubscriptionStateChange([]).valid).toBe(false);
    expect(validateSubscriptionStateChange('string').valid).toBe(false);
  });

  it('rejects incorrect event name', () => {
    const res = validateSubscriptionStateChange({ ...validBase, event: 'wrong_event' });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'event' && e.code === 'INVALID_ENUM')).toBe(true);
  });

  it('rejects missing eventId or customerId', () => {
    const res1 = validateSubscriptionStateChange({ ...validBase, eventId: '' });
    expect(res1.valid).toBe(false);
    expect(res1.errors?.some((e) => e.path === 'eventId')).toBe(true);

    const res2 = validateSubscriptionStateChange({ ...validBase, customerId: '' });
    expect(res2.valid).toBe(false);
    expect(res2.errors?.some((e) => e.path === 'customerId')).toBe(true);
  });

  it('rejects invalid timestamp format', () => {
    const res = validateSubscriptionStateChange({ ...validBase, ts: 'not-a-date' });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'ts' && e.code === 'INVALID_FORMAT')).toBe(true);
  });

  it('rejects invalid or missing status and changeType enums', () => {
    const res = validateSubscriptionStateChange({
      ...validBase,
      properties: {
        ...validBase.properties,
        currentStatus: 'invalid_status',
        changeType: 'invalid_change',
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'properties.currentStatus')).toBe(true);
    expect(res.errors?.some((e) => e.path === 'properties.changeType')).toBe(true);
  });

  it('rejects non-integer mrrDeltaCents or negative currentMrrCents', () => {
    const res = validateSubscriptionStateChange({
      ...validBase,
      properties: {
        ...validBase.properties,
        mrrDeltaCents: 50.25, // floating point not allowed
        currentMrrCents: -100, // negative not allowed
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'properties.mrrDeltaCents')).toBe(true);
    expect(res.errors?.some((e) => e.path === 'properties.currentMrrCents')).toBe(true);
  });

  it('rejects invalid currency codes', () => {
    const res = validateSubscriptionStateChange({
      ...validBase,
      properties: {
        ...validBase.properties,
        currency: 'US', // 2 chars instead of 3
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'properties.currency')).toBe(true);
  });

  it('enforces cancellation status coherence', () => {
    const res = validateSubscriptionStateChange({
      ...validBase,
      properties: {
        ...validBase.properties,
        changeType: 'cancellation',
        currentStatus: 'active', // must be 'canceled'
        mrrDeltaCents: -5000,
        currentMrrCents: 0,
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);
  });

  it('enforces new subscription has no previous status', () => {
    const res = validateSubscriptionStateChange({
      ...validBase,
      properties: {
        ...validBase.properties,
        changeType: 'new',
        previousStatus: 'active', // should not have previous status
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);
  });

  it('exports all enum arrays with correct values', () => {
    expect(SUBSCRIPTION_STATUSES).toContain('active');
    expect(SUBSCRIPTION_STATUSES).toContain('canceled');
    expect(SUBSCRIPTION_CHANGE_TYPES).toContain('new');
    expect(SUBSCRIPTION_CHANGE_TYPES).toContain('upgrade');
    expect(PLAN_INTERVALS).toContain('month');
    expect(PLAN_INTERVALS).toContain('year');
  });
});

describe('Canonical Schemas - customer_transaction', () => {
  const validTx = {
    eventId: 'evt_tx_01',
    event: 'customer_transaction',
    ts: '2026-09-02T12:00:00.000Z',
    customerId: 'cust_test_1',
    properties: {
      transactionId: 'ch_123',
      transactionType: 'first_charge',
      status: 'succeeded',
      amountCents: 12000,
      currency: 'USD',
    },
  };

  it('validates a correct transaction payload', () => {
    const res = validateCustomerTransaction(validTx, { now: '2026-09-02T12:00:00.000Z' });
    expect(res.valid).toBe(true);
    expect(res.data?.properties.amountCents).toBe(12000);
  });

  it('rejects negative amountCents', () => {
    const res = validateCustomerTransaction({
      ...validTx,
      properties: {
        ...validTx.properties,
        amountCents: -500,
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'properties.amountCents')).toBe(true);
  });

  it('rejects refund amount exceeding total charge amount', () => {
    const res = validateCustomerTransaction({
      ...validTx,
      properties: {
        ...validTx.properties,
        transactionType: 'refund',
        amountCents: 10000,
        refundedAmountCents: 15000, // exceeds 10000
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'properties.refundedAmountCents' && e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);
  });

  it('requires failureCode or failureMessage for failed transactions', () => {
    const res = validateCustomerTransaction({
      ...validTx,
      properties: {
        ...validTx.properties,
        status: 'failed',
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);
  });

  it('passes failed transaction when failureCode is provided', () => {
    const res = validateCustomerTransaction(
      {
        ...validTx,
        properties: {
          ...validTx.properties,
          status: 'failed',
          failureCode: 'card_declined',
        },
      },
      { now: '2026-09-02T12:00:00.000Z' }
    );
    expect(res.valid).toBe(true);
  });

  it('exports transaction constants', () => {
    expect(TRANSACTION_TYPES).toContain('first_charge');
    expect(TRANSACTION_TYPES).toContain('recurring_renewal');
    expect(TRANSACTION_STATUSES).toContain('succeeded');
    expect(TRANSACTION_STATUSES).toContain('failed');
  });
});

describe('Canonical Schemas - ad_spend', () => {
  const validSpend = {
    measure: 'ad_spend',
    ts: '2026-09-02',
    value: 1250.75,
    dimensions: {
      channelId: 'google_ads',
      campaignId: 'camp_b2b_us',
      currency: 'USD',
      impressions: 5000,
      clicks: 250,
      conversions: 15,
    },
  };

  it('validates a correct ad spend record with date-only string', () => {
    const res = validateAdSpend(validSpend, { now: '2026-09-02T12:00:00.000Z' });
    expect(res.valid).toBe(true);
    expect(res.data?.value).toBe(1250.75);
    expect(res.data?.dimensions.channelId).toBe('google_ads');
  });

  it('validates with ISO-8601 full timestamp', () => {
    const res = validateAdSpend(
      { ...validSpend, ts: '2026-09-02T10:00:00.000Z' },
      { now: '2026-09-02T12:00:00.000Z' }
    );
    expect(res.valid).toBe(true);
  });

  it('rejects and quarantines negative spend', () => {
    const res = validateAdSpend({
      ...validSpend,
      value: -150.0,
    });
    expect(res.valid).toBe(false);
    expect(res.quarantined).toBe(true);
    expect(res.quarantineReason).toContain('Negative spend');
    expect(res.errors?.some((e) => e.code === 'NEGATIVE_SPEND')).toBe(true);
  });

  it('rejects invalid channel enum', () => {
    const res = validateAdSpend({
      ...validSpend,
      dimensions: {
        ...validSpend.dimensions,
        channelId: 'myspace_ads',
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'dimensions.channelId')).toBe(true);
  });

  it('rejects missing campaignId or currency', () => {
    const res = validateAdSpend({
      ...validSpend,
      dimensions: {
        channelId: 'meta_ads',
        campaignId: '',
        currency: '',
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'dimensions.campaignId')).toBe(true);
    expect(res.errors?.some((e) => e.path === 'dimensions.currency')).toBe(true);
  });

  it('exports channel IDs', () => {
    expect(AD_CHANNEL_IDS).toContain('google_ads');
    expect(AD_CHANNEL_IDS).toContain('meta_ads');
    expect(AD_CHANNEL_IDS).toContain('tiktok_ads');
    expect(AD_CHANNEL_IDS).toContain('offline_csv');
  });
});

describe('Canonical Schemas - product_telemetry', () => {
  const validTel = {
    eventId: 'evt_tel_01',
    event: 'session_start',
    ts: '2026-09-02T12:00:00.000Z',
    anonId: 'anon_device_99',
    properties: {
      sessionId: 'sess_101',
      platform: 'web',
      utmSource: 'google',
    },
  };

  it('validates a correct telemetry event', () => {
    const res = validateProductTelemetry(validTel, { now: '2026-09-02T12:00:00.000Z' });
    expect(res.valid).toBe(true);
    expect(res.data?.anonId).toBe('anon_device_99');
  });

  it('rejects missing anonId', () => {
    const res = validateProductTelemetry({ ...validTel, anonId: '' });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'anonId')).toBe(true);
  });

  it('requires customerId when event is identify', () => {
    const res = validateProductTelemetry({
      ...validTel,
      event: 'identify',
      customerId: undefined,
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'customerId' && e.code === 'BUSINESS_LOGIC_VIOLATION')).toBe(true);
  });

  it('passes identify event when customerId is present', () => {
    const res = validateProductTelemetry(
      {
        ...validTel,
        event: 'identify',
        customerId: 'cust_alice',
      },
      { now: '2026-09-02T12:00:00.000Z' }
    );
    expect(res.valid).toBe(true);
  });

  it('exports telemetry platforms', () => {
    expect(TELEMETRY_PLATFORMS).toContain('web');
    expect(TELEMETRY_PLATFORMS).toContain('ios');
    expect(TELEMETRY_PLATFORMS).toContain('android');
  });
});

describe('Canonical Schemas - crm_lifecycle', () => {
  const validCrm = {
    eventId: 'evt_crm_01',
    event: 'crm_lifecycle',
    ts: '2026-09-02T12:00:00.000Z',
    customerId: 'cust_test_1',
    properties: {
      stage: 'demo_scheduled',
      dealId: 'deal_999',
      dealValueCents: 500000,
      currency: 'USD',
      sourceCrm: 'hubspot',
    },
  };

  it('validates a correct CRM lifecycle event', () => {
    const res = validateCrmLifecycle(validCrm, { now: '2026-09-02T12:00:00.000Z' });
    expect(res.valid).toBe(true);
    expect(res.data?.properties.stage).toBe('demo_scheduled');
    expect(res.data?.properties.dealValueCents).toBe(500000);
  });

  it('rejects invalid CRM stage', () => {
    const res = validateCrmLifecycle({
      ...validCrm,
      properties: {
        ...validCrm.properties,
        stage: 'not_a_valid_stage',
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'properties.stage')).toBe(true);
  });

  it('rejects negative dealValueCents', () => {
    const res = validateCrmLifecycle({
      ...validCrm,
      properties: {
        ...validCrm.properties,
        dealValueCents: -500,
      },
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.some((e) => e.path === 'properties.dealValueCents')).toBe(true);
  });

  it('exports CRM stages', () => {
    expect(CRM_STAGES).toContain('lead');
    expect(CRM_STAGES).toContain('mql');
    expect(CRM_STAGES).toContain('sql');
    expect(CRM_STAGES).toContain('demo_scheduled');
    expect(CRM_STAGES).toContain('customer');
    expect(CRM_STAGES).toContain('lost');
  });
});
