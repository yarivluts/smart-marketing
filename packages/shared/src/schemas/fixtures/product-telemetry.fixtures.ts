import type { ProductTelemetryEvent } from '../product-telemetry';

export const productTelemetryFixtures: {
  sessionStart: ProductTelemetryEvent;
  userPing: ProductTelemetryEvent;
  featureUsed: ProductTelemetryEvent;
  pageView: ProductTelemetryEvent;
  signupCompleted: ProductTelemetryEvent;
  identify: ProductTelemetryEvent;
} = {
  sessionStart: {
    eventId: 'evt_tel_start_001',
    event: 'session_start',
    ts: '2026-09-02T08:00:00.000Z',
    anonId: 'anon_device_uuid_8831',
    properties: {
      sessionId: 'sess_live_9901_abc',
      platform: 'web',
      appVersion: '2.4.0',
      url: 'https://app.growthos.io/dashboard?utm_source=google&utm_medium=cpc&utm_campaign=us_b2b_search',
      path: '/dashboard',
      referrer: 'https://www.google.com/',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'us_b2b_search',
      clickId: 'gclid_live_test_778899',
    },
  },

  userPing: {
    eventId: 'evt_tel_ping_002',
    event: 'user_ping',
    ts: '2026-09-02T08:05:00.000Z',
    anonId: 'anon_device_uuid_8831',
    customerId: 'cust_acme_corp',
    properties: {
      sessionId: 'sess_live_9901_abc',
      platform: 'web',
      durationSeconds: 300,
    },
  },

  featureUsed: {
    eventId: 'evt_tel_feature_003',
    event: 'feature_used',
    ts: '2026-09-02T08:12:00.000Z',
    anonId: 'anon_device_uuid_8831',
    customerId: 'cust_acme_corp',
    properties: {
      sessionId: 'sess_live_9901_abc',
      platform: 'web',
      featureName: 'cohort_retention_export_csv',
      path: '/cohorts',
      customProperties: {
        cohortSpanMonths: 24,
        exportedRows: 48,
        format: 'csv',
      },
    },
  },

  pageView: {
    eventId: 'evt_tel_pv_004',
    event: 'page_view',
    ts: '2026-09-02T08:10:00.000Z',
    anonId: 'anon_device_uuid_8831',
    customerId: 'cust_acme_corp',
    properties: {
      sessionId: 'sess_live_9901_abc',
      platform: 'web',
      path: '/cohorts',
      pageTitle: 'Acquisition Cohorts & Breakeven — GrowthOS',
      referrer: 'https://app.growthos.io/dashboard',
    },
  },

  signupCompleted: {
    eventId: 'evt_tel_signup_005',
    event: 'signup_completed',
    ts: '2026-09-02T07:55:00.000Z',
    anonId: 'anon_device_uuid_8831',
    customerId: 'cust_acme_corp',
    properties: {
      sessionId: 'sess_live_9901_abc',
      platform: 'web',
      url: 'https://app.growthos.io/signup',
      path: '/signup',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'us_b2b_search',
      customProperties: {
        planSelected: 'growth_monthly',
        companySize: '25-50',
      },
    },
  },

  identify: {
    eventId: 'evt_tel_ident_006',
    event: 'identify',
    ts: '2026-09-02T07:56:00.000Z',
    anonId: 'anon_device_uuid_8831',
    customerId: 'cust_acme_corp',
    properties: {
      sessionId: 'sess_live_9901_abc',
      platform: 'web',
      customProperties: {
        email: 'alice@acmecorp.com',
        role: 'Head of Growth',
        orgName: 'Acme Corporation',
      },
    },
  },
};
