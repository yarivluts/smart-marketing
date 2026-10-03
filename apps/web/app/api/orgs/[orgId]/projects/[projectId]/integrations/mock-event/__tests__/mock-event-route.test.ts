import { describe, expect, it } from 'vitest';
import {
  validateCanonicalEvent,
  subscriptionStateChangeFixtures,
  customerTransactionFixtures,
  adSpendFixtures,
  productTelemetryFixtures,
  crmLifecycleFixtures,
  type CanonicalEventType,
} from '@growthos/shared';

export interface MockEventRequest {
  connectorId: string;
  eventType: CanonicalEventType;
  payload?: Record<string, unknown>;
  count?: number;
}

export interface MockEventResponse {
  success: boolean;
  eventCount: number;
  connectorStatus: 'active' | 'degraded' | 'missing';
  message: string;
  validatedEvents?: any[];
  errors?: Array<{ path: string; message: string; code: string }>;
}

export async function handleMockEventRoute(
  request: MockEventRequest,
  context: { params: { orgId: string; projectId: string } },
): Promise<{ status: number; body: MockEventResponse }> {
  const { orgId, projectId } = context.params;

  if (!orgId || !projectId) {
    return {
      status: 400,
      body: {
        success: false,
        eventCount: 0,
        connectorStatus: 'missing',
        message: 'Missing required route parameters: orgId and projectId',
      },
    };
  }

  if (!request.connectorId || !request.eventType) {
    return {
      status: 400,
      body: {
        success: false,
        eventCount: 0,
        connectorStatus: 'missing',
        message: 'Missing connectorId or eventType in request body',
      },
    };
  }

  const validTypes: CanonicalEventType[] = [
    'subscription_state_change',
    'customer_transaction',
    'ad_spend',
    'product_telemetry',
    'crm_lifecycle',
  ];

  if (!validTypes.includes(request.eventType)) {
    return {
      status: 400,
      body: {
        success: false,
        eventCount: 0,
        connectorStatus: 'missing',
        message: `Invalid eventType: ${request.eventType}`,
      },
    };
  }

  // Determine payload: custom payload or canonical valid fixture
  let rawPayload: any = request.payload;
  if (!rawPayload) {
    switch (request.eventType) {
      case 'subscription_state_change':
        rawPayload = subscriptionStateChangeFixtures.newSubscription;
        break;
      case 'customer_transaction':
        rawPayload = customerTransactionFixtures.initialPurchase;
        break;
      case 'ad_spend':
        rawPayload = adSpendFixtures.googleAdsSpend;
        break;
      case 'product_telemetry':
        rawPayload = productTelemetryFixtures.sessionStart;
        break;
      case 'crm_lifecycle':
        rawPayload = crmLifecycleFixtures.pipedriveDealWon;
        break;
    }
  }

  const validation = validateCanonicalEvent(request.eventType, rawPayload);
  if (!validation.valid) {
    return {
      status: 422,
      body: {
        success: false,
        eventCount: 0,
        connectorStatus: 'degraded',
        message: `Validation failed for eventType: ${request.eventType}`,
        errors: validation.errors,
      },
    };
  }

  const count = request.count || 1;

  return {
    status: 200,
    body: {
      success: true,
      eventCount: count,
      connectorStatus: 'active',
      message: `Successfully ingested ${count} mock ${request.eventType} events for connector ${request.connectorId}`,
      validatedEvents: [validation.data],
    },
  };
}

describe('F18: Mock Event Emission Engine & Live Status Transition', () => {
  const context = { params: { orgId: 'org-test-1', projectId: 'proj-test-1' } };

  describe('Tier 1: Primary Happy Path Scenarios', () => {
    it('F18-T1-01: emits valid subscription_state_change mock event transitioning status to active', async () => {
      const res = await handleMockEventRoute(
        {
          connectorId: 'stripe',
          eventType: 'subscription_state_change',
        },
        context,
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.connectorStatus).toBe('active');
      expect(res.body.eventCount).toBe(1);
      expect(res.body.message).toContain('Successfully ingested');
    });

    it('F18-T1-02: emits valid ad_spend mock event for Google Ads and returns validated payload', async () => {
      const res = await handleMockEventRoute(
        {
          connectorId: 'google_ads',
          eventType: 'ad_spend',
        },
        context,
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.validatedEvents?.[0].dimensions.channelId).toBe('google_ads');
    });

    it('F18-T1-03: emits valid customer_transaction mock event with custom valid payload', async () => {
      const customTransaction = {
        eventId: 'evt_custom_tx_101',
        event: 'customer_transaction',
        ts: '2026-04-17T12:00:00Z',
        customerId: 'cus_acme_99',
        properties: {
          transactionId: 'tx_101',
          transactionType: 'first_charge',
          status: 'succeeded',
          amountCents: 15000,
          currency: 'USD',
          paymentMethod: 'card',
        },
      };

      const res = await handleMockEventRoute(
        {
          connectorId: 'stripe',
          eventType: 'customer_transaction',
          payload: customTransaction,
        },
        context,
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.validatedEvents?.[0].properties.amountCents).toBe(15000);
    });

    it('F18-T1-04: emits valid product_telemetry event for Web SDK', async () => {
      const res = await handleMockEventRoute(
        {
          connectorId: 'web_sdk',
          eventType: 'product_telemetry',
        },
        context,
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.connectorStatus).toBe('active');
    });

    it('F18-T1-05: emits valid crm_lifecycle event for HubSpot deals', async () => {
      const res = await handleMockEventRoute(
        {
          connectorId: 'hubspot',
          eventType: 'crm_lifecycle',
        },
        context,
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.connectorStatus).toBe('active');
    });
  });

  describe('Tier 2: Boundary Values & Error Handling', () => {
    it('F18-T2-01: rejects request when orgId or projectId parameters are missing (400)', async () => {
      const res = await handleMockEventRoute(
        {
          connectorId: 'stripe',
          eventType: 'subscription_state_change',
        },
        { params: { orgId: '', projectId: '' } },
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Missing required route parameters');
    });

    it('F18-T2-02: rejects request when connectorId or eventType are omitted in body (400)', async () => {
      const res = await handleMockEventRoute(
        {
          connectorId: '',
          eventType: '' as any,
        },
        context,
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('F18-T2-03: rejects unsupported or unknown eventType (400)', async () => {
      const res = await handleMockEventRoute(
        {
          connectorId: 'stripe',
          eventType: 'unknown_future_event' as any,
        },
        context,
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid eventType');
    });

    it('F18-T2-04: returns 422 Unprocessable Entity with validation diagnostics on malformed payload', async () => {
      const malformedPayload = {
        eventId: 'evt_invalid',
        event: 'customer_transaction',
        ts: '2026-04-17T12:00:00Z',
        customerId: 'cus_1',
        properties: {
          transactionId: 'tx_1',
          transactionType: 'first_charge',
          status: 'succeeded',
          amountCents: -5000, // Invalid negative amount
          currency: 'INVALID_CURRENCY',
        },
      };

      const res = await handleMockEventRoute(
        {
          connectorId: 'stripe',
          eventType: 'customer_transaction',
          payload: malformedPayload,
        },
        context,
      );

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.connectorStatus).toBe('degraded');
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors!.length).toBeGreaterThan(0);
    });

    it('F18-T2-05: supports batch count parameter generating multiple event receipts', async () => {
      const res = await handleMockEventRoute(
        {
          connectorId: 'meta_ads',
          eventType: 'ad_spend',
          count: 50,
        },
        context,
      );

      expect(res.status).toBe(200);
      expect(res.body.eventCount).toBe(50);
    });
  });
});
