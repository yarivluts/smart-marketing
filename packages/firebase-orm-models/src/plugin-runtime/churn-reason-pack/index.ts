import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { ensureCancellationReasonSchemaRegistered } from '../../services/churn-reason.service';
import { CHURN_REASON_PACK_METRICS, type ChurnReasonPackMetricDefinition } from './metrics';

export * from './manifest';
export * from './metrics';

export interface EnsureChurnReasonPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: ChurnReasonPackMetricDefinition,
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
 * Idempotently registers the KAN-84 Churn Reason pack: the
 * `cancellation_reason` event schema first (this pack's own metric's
 * `fact_cancellation_reason` dbt mart is built from it — same
 * schema-before-metrics ordering `ensureFeedbackPackRegistered`/KAN-82
 * establishes), then the `cancellations_total` metric.
 */
export async function ensureChurnReasonPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureChurnReasonPackRegisteredResult> {
  await ensureCancellationReasonSchemaRegistered({ organizationId, projectId, createdByUserId });

  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const outcomes = await Promise.all(
    CHURN_REASON_PACK_METRICS.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)),
  );
  CHURN_REASON_PACK_METRICS.forEach((metric, index) => {
    (outcomes[index] === 'registered' ? registered : alreadyRegistered).push(metric.name);
  });

  return { registered, alreadyRegistered };
}
