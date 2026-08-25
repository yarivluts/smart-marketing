import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { ensureExperimentSchemasRegistered } from '../../services/experiment.service';
import { EXPERIMENT_PACK_METRICS, type ExperimentPackMetricDefinition } from './metrics';

export * from './manifest';
export * from './metrics';

export interface EnsureExperimentPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: ExperimentPackMetricDefinition,
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
 * Idempotently registers the KAN-89 Experiment pack: both
 * `experiment_exposure`/`experiment_conversion` event schemas first (this
 * pack's own metrics' `fact_experiment_event` dbt mart is built from them —
 * same schema-before-metrics ordering `ensureChurnReasonPackRegistered`/
 * KAN-84 establishes), then the `experiment_exposures`/
 * `experiment_conversions` metrics.
 */
export async function ensureExperimentPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureExperimentPackRegisteredResult> {
  await ensureExperimentSchemasRegistered({ organizationId, projectId, createdByUserId });

  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const outcomes = await Promise.all(EXPERIMENT_PACK_METRICS.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)));
  EXPERIMENT_PACK_METRICS.forEach((metric, index) => {
    (outcomes[index] === 'registered' ? registered : alreadyRegistered).push(metric.name);
  });

  return { registered, alreadyRegistered };
}
