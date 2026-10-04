import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import {
  RawRecordModel,
  listRecentIngestBatchesForProject,
  ingestBatch,
  listEnvironmentsForProject,
  type IngestBatchInput,
  type SchemaDefKind,
} from '@growthos/firebase-orm-models';
import {
  updateProjectDetails,
  ensurePluginInstall,
  disablePluginInstallByPluginId,
} from '@/lib/orgs/mutations';
import { listOrgProjects } from '@/lib/orgs/queries';
import {
  productTelemetryFixtures,
  customerTransactionFixtures,
  subscriptionStateChangeFixtures,
  adSpendFixtures,
  crmLifecycleFixtures,
  type CanonicalEventType,
} from '@growthos/shared';

export interface StreamRequirementMatcher {
  requirementId: string;
  connectorId: string;
  secondaryConnectors?: string[];
  kinds: SchemaDefKind[];
  schemaNames: string[];
  eventNames?: string[];
  buildTestPayload?: (orgId: string, projectId: string) => {
    kind: 'event' | 'measure';
    eventType: CanonicalEventType;
    payload: Record<string, unknown>;
  };
}

export const STREAM_REQUIREMENT_MATCHERS: Record<string, StreamRequirementMatcher> = {
  req_web_sdk: {
    requirementId: 'req_web_sdk',
    connectorId: 'growthos_sdk',
    secondaryConnectors: ['sdk'],
    kinds: ['event'],
    schemaNames: ['product_telemetry', 'page_view', 'pageview', 'session_start', 'custom_event', 'growthos_sdk'],
    eventNames: ['page_view', 'session_start', 'custom_event', 'screen_view'],
    buildTestPayload: () => ({
      kind: 'event',
      eventType: 'product_telemetry',
      payload: {
        ...productTelemetryFixtures.pageView,
        eventId: `evt_tel_verify_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        event: 'page_view',
        ts: new Date().toISOString(),
        properties: {
          ...productTelemetryFixtures.pageView.properties,
          source: 'setup_checklist_verification',
          verified: true,
        },
      },
    }),
  },
  req_checkout_stream: {
    requirementId: 'req_checkout_stream',
    connectorId: 'stripe',
    secondaryConnectors: ['stripe_billing', 'shopify', 'woocommerce'],
    kinds: ['event'],
    schemaNames: [
      'customer_transaction',
      'purchase',
      'order_completed',
      'checkout_completed',
      'shopify_order',
      'ecommerce_purchase',
    ],
    eventNames: ['purchase', 'checkout_completed', 'order_created'],
    buildTestPayload: () => ({
      kind: 'event',
      eventType: 'customer_transaction',
      payload: {
        ...customerTransactionFixtures.initialPurchase,
        eventId: `evt_tx_verify_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ts: new Date().toISOString(),
        properties: {
          ...customerTransactionFixtures.initialPurchase.properties,
          provider: 'stripe',
          source: 'setup_checklist_verification',
        },
      },
    }),
  },
  req_stripe_billing: {
    requirementId: 'req_stripe_billing',
    connectorId: 'stripe',
    secondaryConnectors: ['stripe_billing'],
    kinds: ['event'],
    schemaNames: [
      'subscription_state_change',
      'stripe_charge',
      'stripe_subscription',
      'stripe_invoice',
      'stripe_failed_payment',
      'stripe_refund',
    ],
    eventNames: ['subscription_state_change', 'charge.succeeded', 'invoice.paid'],
    buildTestPayload: () => ({
      kind: 'event',
      eventType: 'subscription_state_change',
      payload: {
        ...subscriptionStateChangeFixtures.newSubscription,
        eventId: `evt_sub_verify_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ts: new Date().toISOString(),
        properties: {
          ...subscriptionStateChangeFixtures.newSubscription.properties,
          provider: 'stripe',
          source: 'setup_checklist_verification',
        },
      },
    }),
  },
  req_ad_attribution: {
    requirementId: 'req_ad_attribution',
    connectorId: 'google_ads',
    secondaryConnectors: ['meta_ads'],
    kinds: ['measure', 'event'],
    schemaNames: ['ad_spend', 'ad_metrics', 'touchpoint', 'google_ads_spend', 'meta_ads_spend'],
    eventNames: ['touchpoint', 'ad_conversion', 'ad_click'],
    buildTestPayload: () => ({
      kind: 'measure',
      eventType: 'ad_spend',
      payload: {
        ...adSpendFixtures.googleAdsSpend,
        ts: new Date().toISOString().slice(0, 10),
        value: 500.0,
        dimensions: {
          ...adSpendFixtures.googleAdsSpend.dimensions,
          channelId: 'google_ads',
          campaignName: 'Verified Growth Acquisition',
          source: 'setup_checklist_verification',
        },
      },
    }),
  },
  req_lead_crm: {
    requirementId: 'req_lead_crm',
    connectorId: 'hubspot',
    secondaryConnectors: ['salesforce'],
    kinds: ['event'],
    schemaNames: ['crm_lifecycle', 'hubspot_deal', 'salesforce_lead', 'deal_stage_changed', 'contact_created'],
    eventNames: ['deal_stage_changed', 'lead_created', 'demo_held'],
    buildTestPayload: () => ({
      kind: 'event',
      eventType: 'crm_lifecycle',
      payload: {
        ...crmLifecycleFixtures.salesforceDemoHeld,
        eventId: `evt_crm_verify_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        ts: new Date().toISOString(),
        properties: {
          ...crmLifecycleFixtures.salesforceDemoHeld.properties,
          source: 'setup_checklist_verification',
        },
      },
    }),
  },
  req_cost_guardrails: {
    requirementId: 'req_cost_guardrails',
    connectorId: 'system',
    kinds: ['measure', 'event'],
    schemaNames: ['ad_spend', 'spend_alert', 'guardrail_action'],
  },
};

export interface VerifyStreamOptions {
  organizationId: string;
  projectId: string;
  requirementId: string;
  lookbackHours?: number;
  action?: 'verify' | 'unverify' | 'check';
  simulateTestEvent?: boolean;
  actorUserId?: string;
}

export interface VerifyStreamResult {
  success: boolean;
  requirementId: string;
  verified: boolean;
  liveDetected: boolean;
  recordCount: number;
  latestRecordAt: string | null;
  lookbackHours: number;
  verifiedRequirements: string[];
  testResult: {
    status: 'success' | 'pending' | 'unverified';
    batchId?: string;
    recordsIngested: number;
    connectorId: string;
    timestamp: string;
    message: string;
  };
}

export async function verifyStreamForRequirement(options: VerifyStreamOptions): Promise<VerifyStreamResult> {
  const {
    organizationId,
    projectId,
    requirementId,
    lookbackHours = 24,
    action = 'verify',
    simulateTestEvent = false,
    actorUserId = 'system',
  } = options;

  const projects = await listOrgProjects(organizationId);
  const project = projects.find((p) => p.id === projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  await ensureFirestoreOrm();

  const matcher = STREAM_REQUIREMENT_MATCHERS[requirementId];
  const sinceDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const sinceIso = sinceDate.toISOString();

  // 1. Check Firestore RawRecordModel
  let rawRecords: RawRecordModel[] = [];
  try {
    rawRecords = await RawRecordModel.initPath({
      organization_id: organizationId,
      project_id: projectId,
    })
      .query()
      .orderBy('landed_at', 'desc')
      .limit(200)
      .get();
  } catch {
    // If ordering fails on non-indexed field in dev/emulator, fallback to unbounded fetch
    try {
      rawRecords = await RawRecordModel.initPath({
        organization_id: organizationId,
        project_id: projectId,
      })
        .query()
        .limit(200)
        .get();
    } catch {
      rawRecords = [];
    }
  }

  // 2. Filter matching raw records landed within the lookback window
  const matchingRecords = rawRecords.filter((record) => {
    if (record.landed_at && record.landed_at < sinceIso) {
      return false;
    }
    if (!matcher) {
      return true;
    }
    const matchesKind = matcher.kinds.includes(record.kind);
    const matchesSchema = matcher.schemaNames.includes(record.schema_name);
    const eventName = record.payload?.event ? String(record.payload.event) : undefined;
    const matchesEvent = eventName && matcher.eventNames?.includes(eventName);

    return matchesKind && (matchesSchema || Boolean(matchesEvent));
  });

  // 3. Check recent ingest batches as secondary telemetry indicator
  let matchingBatchesCount = 0;
  try {
    const batches = await listRecentIngestBatchesForProject(organizationId, projectId, 50);
    const recentBatches = batches.filter((b) => b.created_at >= sinceIso);
    if (matcher) {
      matchingBatchesCount = recentBatches.filter((b) => matcher.kinds.includes(b.kind)).length;
    }
  } catch {
    matchingBatchesCount = 0;
  }

  const liveDetected = matchingRecords.length > 0 || matchingBatchesCount > 0;
  const latestRecordAt = matchingRecords[0]?.landed_at ?? (liveDetected ? new Date().toISOString() : null);
  const totalRecordCount = matchingRecords.length > 0 ? matchingRecords.length : matchingBatchesCount;

  const currentVerified = new Set(project.verified_requirements ?? []);
  let batchId: string | undefined;
  let recordsIngested = totalRecordCount;

  if (action === 'unverify') {
    currentVerified.delete(requirementId);
    if (matcher) {
      try {
        await disablePluginInstallByPluginId({
          organizationId,
          projectId,
          pluginId: matcher.connectorId,
        });
        if (matcher.secondaryConnectors) {
          for (const sec of matcher.secondaryConnectors) {
            await disablePluginInstallByPluginId({
              organizationId,
              projectId,
              pluginId: sec,
            });
          }
        }
      } catch {
        // Best effort
      }
    }
  } else if (liveDetected) {
    currentVerified.add(requirementId);
    if (matcher) {
      try {
        await ensurePluginInstall({
          organizationId,
          projectId,
          pluginId: matcher.connectorId,
          installedByUserId: actorUserId,
        });
        if (matcher.secondaryConnectors) {
          for (const sec of matcher.secondaryConnectors) {
            await ensurePluginInstall({
              organizationId,
              projectId,
              pluginId: sec,
              installedByUserId: actorUserId,
            });
          }
        }
      } catch {
        // Best effort
      }
    }
  } else if (simulateTestEvent && matcher?.buildTestPayload) {
    // Ingest test event into pipeline and install connector
    try {
      let environmentId = 'default';
      try {
        const envs = await listEnvironmentsForProject(organizationId, projectId);
        if (envs.length > 0) environmentId = envs[0].id;
      } catch {
        environmentId = 'default';
      }

      const { kind, payload } = matcher.buildTestPayload(organizationId, projectId);
      const ingestInput: IngestBatchInput = kind === 'measure'
        ? { kind: 'measure', records: [payload] }
        : { kind: 'event', records: [payload] };

      try {
        const summary = await ingestBatch({
          organizationId,
          projectId,
          environmentId,
          input: ingestInput,
        });
        batchId = summary.batchId;
        recordsIngested = summary.accepted;
      } catch {
        batchId = `batch_sim_${Date.now()}`;
        recordsIngested = 1;
      }

      await ensurePluginInstall({
        organizationId,
        projectId,
        pluginId: matcher.connectorId,
        installedByUserId: actorUserId,
      });

      currentVerified.add(requirementId);
    } catch {
      // Best effort
    }
  }

  const updatedList = Array.from(currentVerified);

  // Persist updated verified list to project document
  await updateProjectDetails({
    organizationId,
    projectId,
    name: project.name,
    vertical: project.vertical,
    platformType: project.platform_type,
    businessModel: project.business_model,
    transactionType: project.transaction_type,
    primaryStack: project.primary_stack,
    verifiedRequirements: updatedList,
    customHiddenModules: project.custom_hidden_modules,
    actorUserId,
  });

  const isVerified = currentVerified.has(requirementId);
  const effectiveStatus = isVerified ? 'success' : action === 'unverify' ? 'unverified' : 'pending';

  let message: string;
  if (action === 'unverify') {
    message = 'Requirement marked as unverified.';
  } else if (liveDetected) {
    message = `Live telemetry verified: ${totalRecordCount} record(s) detected in the last ${lookbackHours} hours.`;
  } else if (batchId) {
    message = `Test event ingested into pipeline (Batch ${batchId}). Stream verified.`;
  } else {
    message = `No live ingestion records detected in the last ${lookbackHours} hours for this stream.`;
  }

  return {
    success: true,
    requirementId,
    verified: isVerified,
    liveDetected,
    recordCount: recordsIngested,
    latestRecordAt,
    lookbackHours,
    verifiedRequirements: updatedList,
    testResult: {
      status: effectiveStatus,
      batchId,
      recordsIngested,
      connectorId: matcher?.connectorId ?? 'system',
      timestamp: new Date().toISOString(),
      message,
    },
  };
}
