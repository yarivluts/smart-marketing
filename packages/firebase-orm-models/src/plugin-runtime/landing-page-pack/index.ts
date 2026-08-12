import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import {
  LANDING_PAGE_PACK_AGGREGATION_METRICS,
  LANDING_PAGE_PACK_FORMULA_METRICS,
  type LandingPagePackMetricDefinition,
} from './metrics';

export * from './manifest';
export * from './metrics';
export * from './default-boards';

export interface EnsureLandingPagePackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: LandingPagePackMetricDefinition,
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
 * Idempotently registers this pack's three metrics — same posture as
 * `ensureSaasMetricPackRegistered`/`ensureEngagementPackRegistered`, and
 * equally retry-safe (each metric is one atomic write, so an interrupted
 * install converges on a reinstall).
 *
 * Two phases, like the SaaS pack and unlike the Engagement pack:
 * `lp_conversion_rate` is a formula over the other two, and
 * `registerMetricDefinition` requires every formula reference to already be
 * an *active* metric at registration time.
 */
export async function ensureLandingPagePackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureLandingPagePackRegisteredResult> {
  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const record = (metric: LandingPagePackMetricDefinition, outcome: 'registered' | 'already_registered'): void => {
    (outcome === 'registered' ? registered : alreadyRegistered).push(metric.name);
  };

  const aggregationOutcomes = await Promise.all(
    LANDING_PAGE_PACK_AGGREGATION_METRICS.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)),
  );
  LANDING_PAGE_PACK_AGGREGATION_METRICS.forEach((metric, index) => record(metric, aggregationOutcomes[index]));

  const formulaOutcomes = await Promise.all(
    LANDING_PAGE_PACK_FORMULA_METRICS.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)),
  );
  LANDING_PAGE_PACK_FORMULA_METRICS.forEach((metric, index) => record(metric, formulaOutcomes[index]));

  return { registered, alreadyRegistered };
}
