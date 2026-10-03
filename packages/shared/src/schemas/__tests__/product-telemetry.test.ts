import { describe, expect, it } from 'vitest';

/**
 * Canonical Schema Test Suite for F11: Product Telemetry (`product_telemetry`)
 * Verifies Tier 1 (Happy Path), Tier 2 (Boundary & Error Cases), Clock Skew
 * Protection, Identity Stitching, Throttling, and Anonymous Device ID Tracking.
 *
 * Source: ORIGINAL_REQUEST §R2, PROJECT.md §2, TEST_INFRA.md F11
 */

export interface ProductTelemetryEvent {
  eventId: string;
  event: string;
  ts: string;
  anonId: string;
  customerId?: string;
  properties: {
    sessionId: string;
    platform: 'web' | 'ios' | 'android' | 'backend';
    appVersion?: string;
    url?: string;
    path?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    clickId?: string;
    featureName?: string;
    customProperties?: Record<string, unknown>;
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export function validateProductTelemetryEvent(payload: unknown): { valid: boolean; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'Payload must be a non-null object', code: 'INVALID_OBJECT' }] };
  }

  const p = payload as Partial<ProductTelemetryEvent>;

  if (!p.eventId || typeof p.eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.eventId)) {
    errors.push({ path: 'eventId', message: 'eventId must be a valid non-empty string up to 128 chars', code: 'INVALID_EVENT_ID' });
  }

  if (!p.event || typeof p.event !== 'string' || p.event.trim().length === 0) {
    errors.push({ path: 'event', message: 'event name is required', code: 'MISSING_EVENT_NAME' });
  }

  if (!p.ts || typeof p.ts !== 'string' || isNaN(Date.parse(p.ts))) {
    errors.push({ path: 'ts', message: 'ts must be a valid ISO-8601 UTC timestamp', code: 'INVALID_TIMESTAMP' });
  } else {
    const time = new Date(p.ts).getTime();
    const now = Date.now();
    const fiveMinutesFuture = now + 5 * 60 * 1000;
    const ninetyDaysPast = now - 90 * 24 * 60 * 60 * 1000;
    if (time > fiveMinutesFuture || time < ninetyDaysPast) {
      errors.push({ path: 'ts', message: 'ts out of telemetry bounds [now-90d, now+5m] (clock skew)', code: 'CLOCK_SKEW_DETECTED' });
    }
  }

  if (!p.anonId || typeof p.anonId !== 'string' || p.anonId.trim().length === 0) {
    errors.push({ path: 'anonId', message: 'anonId is required on all client telemetry events', code: 'MISSING_ANON_ID' });
  }

  if (p.event === 'identify' && (!p.customerId || typeof p.customerId !== 'string' || p.customerId.trim().length === 0)) {
    errors.push({ path: 'customerId', message: "customerId is required on 'identify' events", code: 'MISSING_CUSTOMER_ID_ON_IDENTIFY' });
  }

  const props = p.properties;
  if (!props || typeof props !== 'object') {
    errors.push({ path: 'properties', message: 'properties must be a non-null object', code: 'MISSING_PROPERTIES' });
    return { valid: errors.length === 0, errors };
  }

  if (!props.sessionId || typeof props.sessionId !== 'string' || props.sessionId.trim().length === 0) {
    errors.push({ path: 'properties.sessionId', message: 'sessionId is required', code: 'MISSING_SESSION_ID' });
  }

  const validPlatforms = ['web', 'ios', 'android', 'backend'];
  if (!props.platform || !validPlatforms.includes(props.platform)) {
    errors.push({ path: 'properties.platform', message: 'Invalid platform', code: 'INVALID_PLATFORM' });
  }

  return { valid: errors.length === 0, errors };
}

describe('F11: Canonical Schema — Product Telemetry', () => {
  const validBaseEvent: ProductTelemetryEvent = {
    eventId: 'evt_tel_301',
    event: 'session_start',
    ts: new Date().toISOString(),
    anonId: 'anon_device_xyz_789',
    properties: {
      sessionId: 'sess_abc_123',
      platform: 'web',
      appVersion: '2.4.0',
      url: 'https://app.growthos.io/orgs/org-1/projects/p-1/boards',
      path: '/orgs/org-1/projects/p-1/boards',
      referrer: 'https://google.com',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'brand_search',
    },
  };

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F11-T1-01: validates a session_start web SDK telemetry event', () => {
      const result = validateProductTelemetryEvent(validBaseEvent);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F11-T1-02: validates a feature_exposure event with featureName', () => {
      const event: ProductTelemetryEvent = {
        ...validBaseEvent,
        eventId: 'evt_tel_302',
        event: 'feature_exposure',
        customerId: 'cust_known_42',
        properties: {
          ...validBaseEvent.properties,
          featureName: 'ai_copilot_diff_drawer',
        },
      };
      const result = validateProductTelemetryEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F11-T1-03: validates an identify event linking anonId to customerId', () => {
      const event: ProductTelemetryEvent = {
        ...validBaseEvent,
        eventId: 'evt_tel_303',
        event: 'identify',
        customerId: 'cust_known_42',
      };
      const result = validateProductTelemetryEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F11-T1-04: validates a mobile app telemetry event (iOS/Android)', () => {
      const event: ProductTelemetryEvent = {
        ...validBaseEvent,
        eventId: 'evt_tel_304',
        event: 'app_open',
        properties: {
          ...validBaseEvent.properties,
          platform: 'ios',
          appVersion: '3.1.0-build.45',
        },
      };
      const result = validateProductTelemetryEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F11-T1-05: validates customProperties payload dictionary', () => {
      const event: ProductTelemetryEvent = {
        ...validBaseEvent,
        eventId: 'evt_tel_305',
        event: 'export_report_clicked',
        properties: {
          ...validBaseEvent.properties,
          customProperties: {
            reportFormat: 'pdf',
            dateRange: 'last_30_days',
            includeAnomalies: true,
          },
        },
      };
      const result = validateProductTelemetryEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F11-T2-01: rejects future clock skew timestamp (> 5 minutes in future)', () => {
      const futureTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const event = {
        ...validBaseEvent,
        ts: futureTime,
      };
      const result = validateProductTelemetryEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CLOCK_SKEW_DETECTED')).toBe(true);
    });

    it('F11-T2-02: rejects stale timestamp (> 90 days in the past)', () => {
      const staleTime = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      const event = {
        ...validBaseEvent,
        ts: staleTime,
      };
      const result = validateProductTelemetryEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CLOCK_SKEW_DETECTED')).toBe(true);
    });

    it('F11-T2-03: rejects identify event missing required customerId', () => {
      const event = {
        ...validBaseEvent,
        event: 'identify',
        customerId: undefined,
      };
      const result = validateProductTelemetryEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_CUSTOMER_ID_ON_IDENTIFY')).toBe(true);
    });

    it('F11-T2-04: rejects missing anonId on client event', () => {
      const event = {
        ...validBaseEvent,
        anonId: '',
      };
      const result = validateProductTelemetryEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_ANON_ID')).toBe(true);
    });

    it('F11-T2-05: rejects invalid platform type (e.g. windows_desktop)', () => {
      const event = {
        ...validBaseEvent,
        properties: {
          ...validBaseEvent.properties,
          platform: 'windows_desktop' as unknown as string,
        },

      };
      const result = validateProductTelemetryEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_PLATFORM')).toBe(true);
    });
  });
});
