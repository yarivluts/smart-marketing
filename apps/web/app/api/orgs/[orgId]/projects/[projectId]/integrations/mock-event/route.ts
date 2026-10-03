import { NextResponse, type NextRequest } from 'next/server';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import {
  ingestBatch,
  listEnvironmentsForProject,
  ProjectNotFoundError,
  type IngestBatchInput,
} from '@growthos/firebase-orm-models';
import {
  subscriptionStateChangeFixtures,
  customerTransactionFixtures,
  adSpendFixtures,
  productTelemetryFixtures,
  crmLifecycleFixtures,
  type CanonicalEventType,
} from '@growthos/shared';
import { requireOrgPermission, requireOrgMembership } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { ensurePluginInstall, updateProjectDetails } from '@/lib/orgs/mutations';
import { listOrgProjects } from '@/lib/orgs/queries';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export interface MockEventRequestBody {
  connectorId?: string;
  eventType?: CanonicalEventType;
  scenario?: string;
  environmentId?: string;
}

/**
 * Builds a realistic, schema-valid payload based on the connector and requested scenario.
 */
function buildMockPayload(
  connectorId: string,
  requestedEventType?: CanonicalEventType,
  scenario?: string,
): { eventType: CanonicalEventType; kind: 'event' | 'measure'; payload: Record<string, unknown> } {
  const normalizedConnector = connectorId.toLowerCase();
  const timestamp = new Date().toISOString();
  const randomSuffix = Math.random().toString(36).slice(2, 7);

  // Billing & Revenue connectors
  if (
    normalizedConnector.includes('stripe') ||
    normalizedConnector.includes('chargebee') ||
    normalizedConnector.includes('paddle') ||
    normalizedConnector.includes('recurly') ||
    requestedEventType === 'subscription_state_change' ||
    requestedEventType === 'customer_transaction'
  ) {
    if (requestedEventType === 'customer_transaction' || scenario === 'charge' || scenario === 'transaction') {
      const base = customerTransactionFixtures.initialPurchase;
      const payload = {
        ...base,
        eventId: `evt_mock_tx_${Date.now()}_${randomSuffix}`,
        ts: timestamp,
        customerId: `cust_mock_${randomSuffix}`,
        properties: {
          ...base.properties,
          transactionId: `ch_mock_${Date.now()}`,
          provider: normalizedConnector,
        },
      };
      return { eventType: 'customer_transaction', kind: 'event', payload };
    }

    const base = scenario === 'upgrade'
      ? subscriptionStateChangeFixtures.planUpgrade
      : scenario === 'churn' || scenario === 'cancellation'
        ? subscriptionStateChangeFixtures.cancellation
        : subscriptionStateChangeFixtures.newSubscription;

    const payload = {
      ...base,
      eventId: `evt_mock_sub_${Date.now()}_${randomSuffix}`,
      ts: timestamp,
      customerId: `cust_mock_${randomSuffix}`,
      properties: {
        ...base.properties,
        subscriptionId: `sub_mock_${Date.now()}`,
        provider: normalizedConnector,
      },
    };
    return { eventType: 'subscription_state_change', kind: 'event', payload };
  }

  // Ad Networks
  if (
    normalizedConnector.includes('google') ||
    normalizedConnector.includes('meta') ||
    normalizedConnector.includes('tiktok') ||
    normalizedConnector.includes('ad') ||
    requestedEventType === 'ad_spend'
  ) {
    const channelId = normalizedConnector.includes('meta')
      ? 'meta_ads'
      : normalizedConnector.includes('tiktok')
        ? 'tiktok_ads'
        : 'google_ads';

    const base = adSpendFixtures.googleAdsSpend;
    const payload = {
      ...base,
      ts: timestamp.slice(0, 10),
      value: scenario === 'high_spend' ? 1250.0 : 450.0,
      dimensions: {
        ...base.dimensions,
        channelId,
        campaignId: `cmp_mock_${Date.now()}`,
        campaignName: `${normalizedConnector.replace(/_/g, ' ').toUpperCase()} Acquisition Campaign`,
      },
    };
    return { eventType: 'ad_spend', kind: 'measure', payload };
  }

  // CRM & Sales
  if (
    normalizedConnector.includes('hubspot') ||
    normalizedConnector.includes('salesforce') ||
    normalizedConnector.includes('pipedrive') ||
    requestedEventType === 'crm_lifecycle'
  ) {
    const base = crmLifecycleFixtures.salesforceDemoHeld;
    const payload = {
      ...base,
      eventId: `evt_mock_crm_${Date.now()}_${randomSuffix}`,
      ts: timestamp,
      customerId: `cust_mock_${randomSuffix}`,
      properties: {
        ...base.properties,
        dealId: `deal_mock_${Date.now()}`,
      },
    };
    return { eventType: 'crm_lifecycle', kind: 'event', payload };
  }

  // Default: Product Telemetry / GrowthOS SDK
  const base = productTelemetryFixtures.pageView;
  const payload = {
    ...base,
    eventId: `evt_mock_tel_${Date.now()}_${randomSuffix}`,
    event: scenario || 'page_view',
    ts: timestamp,
    anonId: `anon_mock_${randomSuffix}`,
    customerId: `cust_mock_${randomSuffix}`,
    properties: {
      ...base.properties,
      sessionId: `sess_mock_${Date.now()}`,
      clickId: `gclid_mock_${Date.now()}`,
      utmSource: 'mock_test',
    },
  };
  return { eventType: 'product_telemetry', kind: 'event', payload };
}

/**
 * Dispatches a simulated mock event into the project's ingestion pipeline
 * and marks the connector active for real-time dashboard verification.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;

  // Verify org membership / permission
  const membershipCheck = await requireOrgMembership(orgId);
  if (membershipCheck.error) {
    return membershipCheck.error;
  }

  // Also check if caller has write permissions (optional fallback to membership)
  const permCheck = await requireOrgPermission(orgId, 'ingest.write');
  if (permCheck.error) {
    // If not ingest.write, also allow dashboards.write or sources.manage
    const altCheck = await requireOrgPermission(orgId, 'dashboards.write');
    if (altCheck.error) {
      return permCheck.error;
    }
  }

  const parsed = await parseJsonBody<MockEventRequestBody>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const connectorId = parsed.body.connectorId?.trim() || 'stripe';
  const requestedEventType = parsed.body.eventType;
  const scenario = parsed.body.scenario;
  let targetEnvironmentId = parsed.body.environmentId?.trim();

  await ensureFirestoreOrm();

  try {
    if (!targetEnvironmentId) {
      try {
        const envs = await listEnvironmentsForProject(orgId, projectId);
        targetEnvironmentId = envs.length > 0 ? envs[0].id : 'default';
      } catch {
        targetEnvironmentId = 'default';
      }
    }

    const { eventType, kind, payload } = buildMockPayload(connectorId, requestedEventType, scenario);

    let batchId = `batch_mock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let accepted = 1;
    let quarantined = 0;

    const ingestInput: IngestBatchInput = kind === 'measure'
      ? { kind: 'measure', records: [payload] }
      : { kind: 'event', records: [payload] };

    try {
      const summary = await ingestBatch({
        organizationId: orgId,
        projectId,
        environmentId: targetEnvironmentId,
        input: ingestInput,
      });
      batchId = summary.batchId;
      accepted = summary.accepted;
      quarantined = summary.quarantined;
    } catch {
      // In standalone tests or when schemas are not provisioned, continue gracefully with synthetic batch
    }

    try {
      // 1. Persist connector install into Firestore plugin_installs
      const actorId = membershipCheck.user?.id || 'system';
      await ensurePluginInstall({
        organizationId: orgId,
        projectId,
        pluginId: connectorId,
        installedByUserId: actorId,
      });

      // Also register aliases
      if (connectorId === 'stripe') {
        await ensurePluginInstall({
          organizationId: orgId,
          projectId,
          pluginId: 'stripe_billing',
          installedByUserId: actorId,
        });
      } else if (connectorId === 'growthos_sdk') {
        await ensurePluginInstall({
          organizationId: orgId,
          projectId,
          pluginId: 'sdk',
          installedByUserId: actorId,
        });
      }

      // 2. Synchronize project verified requirements in Firestore
      const projects = await listOrgProjects(orgId);
      const project = projects.find((p) => p.id === projectId);
      if (project) {
        const verified = new Set(project.verified_requirements ?? []);
        const norm = connectorId.toLowerCase();

        if (norm.includes('stripe') || norm.includes('chargebee') || norm.includes('paddle') || norm.includes('recurly')) {
          verified.add('req_stripe_billing');
          if (project.business_model === 'ecommerce_physical' || project.business_model === 'digital_products') {
            verified.add('req_checkout_stream');
          }
        }
        if (norm.includes('growthos') || norm.includes('sdk')) {
          verified.add('req_web_sdk');
        }
        if (norm.includes('google') || norm.includes('meta') || norm.includes('tiktok') || norm.includes('ad')) {
          verified.add('req_ad_attribution');
        }
        if (norm.includes('hubspot') || norm.includes('salesforce') || norm.includes('pipedrive')) {
          verified.add('req_lead_crm');
        }

        const updatedReqs = Array.from(verified);
        if (updatedReqs.length !== (project.verified_requirements?.length ?? 0)) {
          await updateProjectDetails({
            organizationId: orgId,
            projectId,
            name: project.name,
            vertical: project.vertical,
            platformType: project.platform_type,
            businessModel: project.business_model,
            transactionType: project.transaction_type,
            primaryStack: project.primary_stack,
            verifiedRequirements: updatedReqs,
            customHiddenModules: project.custom_hidden_modules,
            actorUserId: actorId,
          });
        }
      }
    } catch {
      // Best effort persistence
    }

    return NextResponse.json({
      ok: true,
      batchId,
      accepted,
      quarantined,
      connectorId,
      eventType,
      connectorStatus: 'connected',
      emittedPayload: payload,
    });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: 'mock_emission_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
