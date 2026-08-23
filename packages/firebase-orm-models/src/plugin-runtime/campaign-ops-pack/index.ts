import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { CAMPAIGN_OPS_PACK_METRICS, type CampaignOpsPackMetricDefinition } from './metrics';

export * from './manifest';
export * from './metrics';

export interface EnsureCampaignOpsPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: CampaignOpsPackMetricDefinition,
): Promise<'registered' | 'already_registered'> {
  try {
    await registerMetricDefinition({
      organizationId,
      projectId,
      name: metric.name,
      definition: metric.definition,
      dimensions: metric.dimensions,
      createdByUserId,
    });
    return 'registered';
  } catch (error) {
    if (error instanceof DuplicateMetricDefinitionError) {
      return 'already_registered';
    }
    throw error;
  }
}

/**
 * Idempotently registers the KAN-86 Campaign Ops pack's four
 * `collection_Nd` metrics (all aggregation-kind, no schema to self-provision
 * first — see `manifest.ts`'s own doc comment).
 */
export async function ensureCampaignOpsPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureCampaignOpsPackRegisteredResult> {
  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const outcomes = await Promise.all(
    CAMPAIGN_OPS_PACK_METRICS.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)),
  );
  CAMPAIGN_OPS_PACK_METRICS.forEach((metric, index) => {
    (outcomes[index] === 'registered' ? registered : alreadyRegistered).push(metric.name);
  });

  return { registered, alreadyRegistered };
}
