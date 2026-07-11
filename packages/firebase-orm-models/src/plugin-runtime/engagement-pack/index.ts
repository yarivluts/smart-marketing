import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { ENGAGEMENT_PACK_METRICS, type EngagementPackMetricDefinition } from './metrics';

export * from './manifest';
export * from './metrics';

export interface EnsureEngagementPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: EngagementPackMetricDefinition,
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
 * Idempotently registers every metric this pack declares (KAN-63, plan `13
 * §E11.5` / `14` gap 2) — mirrors `ensureSaasMetricPackRegistered`'s posture
 * exactly (see that function's own doc comment for the general shape a
 * project installing this pack gets: no admin needs to hand-register five
 * metric definitions first, and re-running this is always safe). Unlike the
 * SaaS pack, every metric here is aggregation-kind — none is a formula
 * referencing another — so a single `Promise.all` registers all five
 * without needing the SaaS pack's own two-phase aggregation-then-formula
 * ordering.
 */
export async function ensureEngagementPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureEngagementPackRegisteredResult> {
  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const outcomes = await Promise.all(
    ENGAGEMENT_PACK_METRICS.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)),
  );
  ENGAGEMENT_PACK_METRICS.forEach((metric, index) => {
    (outcomes[index] === 'registered' ? registered : alreadyRegistered).push(metric.name);
  });

  return { registered, alreadyRegistered };
}
