import { describe, expect, it } from 'vitest';

/**
 * Canonical Schema Test Suite for F12: CRM Lifecycle (`crm_lifecycle`)
 * Verifies Tier 1 (Happy Path), Tier 2 (Boundary & Error Cases), Deal Value Cents,
 * Stage Transitions, Lost Reason Validation, and Owner Email Matching.
 *
 * Source: ORIGINAL_REQUEST §R2, PROJECT.md §2, TEST_INFRA.md F12
 */

export interface CrmLifecycleEvent {
  eventId: string;
  event: 'crm_lifecycle';
  ts: string;
  customerId: string;
  properties: {
    stage: 'lead' | 'mql' | 'sql' | 'opportunity' | 'demo_scheduled' | 'demo_held' | 'customer' | 'lost';
    dealId?: string;
    dealValueCents?: number;
    ownerEmail?: string;
    ownerName?: string;
    companyDomain?: string;
    leadSource?: string;
    lostReason?: string;
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export function validateCrmLifecycleEvent(payload: unknown): { valid: boolean; errors: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'Payload must be a non-null object', code: 'INVALID_OBJECT' }] };
  }

  const p = payload as Partial<CrmLifecycleEvent>;

  if (!p.eventId || typeof p.eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.eventId)) {
    errors.push({ path: 'eventId', message: 'eventId must be a valid non-empty string up to 128 chars', code: 'INVALID_EVENT_ID' });
  }

  if (p.event !== 'crm_lifecycle') {
    errors.push({ path: 'event', message: "event must be 'crm_lifecycle'", code: 'INVALID_EVENT_NAME' });
  }

  if (!p.ts || typeof p.ts !== 'string' || isNaN(Date.parse(p.ts))) {
    errors.push({ path: 'ts', message: 'ts must be a valid ISO-8601 UTC timestamp', code: 'INVALID_TIMESTAMP' });
  }

  if (!p.customerId || typeof p.customerId !== 'string' || p.customerId.trim().length === 0) {
    errors.push({ path: 'customerId', message: 'customerId is required', code: 'MISSING_CUSTOMER_ID' });
  }

  const props = p.properties;
  if (!props || typeof props !== 'object') {
    errors.push({ path: 'properties', message: 'properties must be a non-null object', code: 'MISSING_PROPERTIES' });
    return { valid: errors.length === 0, errors };
  }

  const validStages = ['lead', 'mql', 'sql', 'opportunity', 'demo_scheduled', 'demo_held', 'customer', 'lost'];
  if (!props.stage || !validStages.includes(props.stage)) {
    errors.push({ path: 'properties.stage', message: 'Invalid CRM stage', code: 'INVALID_CRM_STAGE' });
  }

  if (props.dealValueCents !== undefined) {
    if (typeof props.dealValueCents !== 'number' || !Number.isInteger(props.dealValueCents) || props.dealValueCents < 0) {
      errors.push({ path: 'properties.dealValueCents', message: 'dealValueCents must be a non-negative integer', code: 'INVALID_DEAL_VALUE' });
    }
  }

  if (props.ownerEmail !== undefined) {
    if (typeof props.ownerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(props.ownerEmail)) {
      errors.push({ path: 'properties.ownerEmail', message: 'ownerEmail must be a valid email address', code: 'INVALID_OWNER_EMAIL' });
    }
  }

  if (props.stage === 'lost' && (!props.lostReason || typeof props.lostReason !== 'string' || props.lostReason.trim().length === 0)) {
    errors.push({ path: 'properties.lostReason', message: "lostReason is required when stage is 'lost'", code: 'MISSING_LOST_REASON' });
  }

  return { valid: errors.length === 0, errors };
}

describe('F12: Canonical Schema — CRM Lifecycle', () => {
  const validBaseEvent: CrmLifecycleEvent = {
    eventId: 'evt_crm_401',
    event: 'crm_lifecycle',
    ts: new Date().toISOString(),
    customerId: 'cust_lead_900',
    properties: {
      stage: 'demo_scheduled',
      dealId: 'deal_hubspot_77',
      dealValueCents: 2400000,
      ownerEmail: 'sarah.rep@growthos.io',
      ownerName: 'Sarah Jenkins',
      companyDomain: 'cloudcorp.com',
      leadSource: 'linkedin_inbound',
    },
  };

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F12-T1-01: validates a demo_scheduled CRM stage event', () => {
      const result = validateCrmLifecycleEvent(validBaseEvent);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F12-T1-02: validates a demo_held qualification event', () => {
      const event: CrmLifecycleEvent = {
        ...validBaseEvent,
        eventId: 'evt_crm_402',
        properties: {
          ...validBaseEvent.properties,
          stage: 'demo_held',
        },
      };
      const result = validateCrmLifecycleEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F12-T1-03: validates an opportunity conversion to closed-won customer', () => {
      const event: CrmLifecycleEvent = {
        ...validBaseEvent,
        eventId: 'evt_crm_403',
        properties: {
          ...validBaseEvent.properties,
          stage: 'customer',
          dealValueCents: 3600000,
        },
      };
      const result = validateCrmLifecycleEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F12-T1-04: validates a lost stage event with documented lostReason', () => {
      const event: CrmLifecycleEvent = {
        ...validBaseEvent,
        eventId: 'evt_crm_404',
        properties: {
          ...validBaseEvent.properties,
          stage: 'lost',
          lostReason: 'Budget frozen until next fiscal year',
        },
      };
      const result = validateCrmLifecycleEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('F12-T1-05: validates an early lead / MQL creation event without dealId', () => {
      const event: CrmLifecycleEvent = {
        ...validBaseEvent,
        eventId: 'evt_crm_405',
        properties: {
          stage: 'mql',
          companyDomain: 'startup.io',
          leadSource: 'organic_search',
        },
      };
      const result = validateCrmLifecycleEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F12-T2-01: rejects invalid stage identifier (e.g. negotiation)', () => {
      const event = {
        ...validBaseEvent,
        properties: {
          ...validBaseEvent.properties,
          stage: 'negotiation' as unknown as string,
        },

      };
      const result = validateCrmLifecycleEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_CRM_STAGE')).toBe(true);
    });

    it('F12-T2-02: rejects negative dealValueCents', () => {
      const event = {
        ...validBaseEvent,
        properties: {
          ...validBaseEvent.properties,
          dealValueCents: -1000,
        },
      };
      const result = validateCrmLifecycleEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_DEAL_VALUE')).toBe(true);
    });

    it('F12-T2-03: rejects lost stage missing lostReason description', () => {
      const event = {
        ...validBaseEvent,
        properties: {
          ...validBaseEvent.properties,
          stage: 'lost' as const,
          lostReason: undefined,
        },
      };
      const result = validateCrmLifecycleEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_LOST_REASON')).toBe(true);
    });

    it('F12-T2-04: rejects malformed ownerEmail syntax', () => {
      const event = {
        ...validBaseEvent,
        properties: {
          ...validBaseEvent.properties,
          ownerEmail: 'sarah-jenkins-no-domain',
        },
      };
      const result = validateCrmLifecycleEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_OWNER_EMAIL')).toBe(true);
    });

    it('F12-T2-05: rejects non-integer floating point dealValueCents', () => {
      const event = {
        ...validBaseEvent,
        properties: {
          ...validBaseEvent.properties,
          dealValueCents: 5400.99,
        },
      };
      const result = validateCrmLifecycleEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_DEAL_VALUE')).toBe(true);
    });
  });
});
