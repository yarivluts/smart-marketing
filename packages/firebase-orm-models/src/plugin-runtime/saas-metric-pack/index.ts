import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { SAAS_METRIC_PACK_METRICS, type SaasMetricPackDefinition } from './metrics';

export * from './manifest';
export * from './metrics';
export * from './default-boards';

export interface EnsureSaasMetricPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: SaasMetricPackDefinition,
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
 * Idempotently registers every metric this pack declares (KAN-59, plan
 * `13 §E11.1`: "Installing pack registers all metrics"), so a project
 * installing the SaaS/marketing metric pack doesn't need an admin to
 * hand-register seventeen metric definitions first. Registering is the only
 * side effect this pack's own runtime performs on the generic metric
 * registry — mirrors `ensureStripeCommerceSchemasRegistered`'s posture for
 * the schema registry.
 *
 * Two sequential phases, not one `Promise.all` over every metric: formula-
 * kind metrics (`cost_per_signup`, `cac`, ...) require their referenced
 * metrics to already be *active* at registration time
 * (`metric-registry.service.ts`'s `validateMetricDefRequest`), so every
 * aggregation-kind metric in {@link SAAS_METRIC_PACK_METRICS} must finish
 * registering before any formula-kind metric starts. Safe to call on every
 * install/re-run: a metric `registerMetricDefinition` rejects as a
 * {@link DuplicateMetricDefinitionError} just means a prior call (or a human)
 * already registered it — silently counted, not an error. A human is free to
 * `evolveMetricDefinition` one of these afterward; this function never
 * re-registers or overwrites an existing version.
 */
export async function ensureSaasMetricPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureSaasMetricPackRegisteredResult> {
  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const aggregationMetrics = SAAS_METRIC_PACK_METRICS.filter((metric) => metric.definition.kind === 'aggregation');
  const formulaMetrics = SAAS_METRIC_PACK_METRICS.filter((metric) => metric.definition.kind === 'formula');

  const aggregationOutcomes = await Promise.all(
    aggregationMetrics.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)),
  );
  aggregationMetrics.forEach((metric, index) => {
    (aggregationOutcomes[index] === 'registered' ? registered : alreadyRegistered).push(metric.name);
  });

  const formulaOutcomes = await Promise.all(
    formulaMetrics.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)),
  );
  formulaMetrics.forEach((metric, index) => {
    (formulaOutcomes[index] === 'registered' ? registered : alreadyRegistered).push(metric.name);
  });

  return { registered, alreadyRegistered };
}
