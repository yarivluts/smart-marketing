import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { REP_COLLECTIONS_PACK_METRICS, type RepCollectionsPackMetricDefinition } from './metrics';

export * from './manifest';
export * from './metrics';

export interface EnsureRepCollectionsPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: RepCollectionsPackMetricDefinition,
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
 * Idempotently registers the KAN-88 Rep Collections pack's one
 * `collected_revenue_by_customer` metric — no schema to self-provision
 * first, same posture `ensureCampaignOpsPackRegistered` establishes.
 */
export async function ensureRepCollectionsPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureRepCollectionsPackRegisteredResult> {
  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const outcomes = await Promise.all(
    REP_COLLECTIONS_PACK_METRICS.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)),
  );
  REP_COLLECTIONS_PACK_METRICS.forEach((metric, index) => {
    (outcomes[index] === 'registered' ? registered : alreadyRegistered).push(metric.name);
  });

  return { registered, alreadyRegistered };
}
