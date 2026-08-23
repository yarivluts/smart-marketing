import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { ensureSurveyResponseSchemaRegistered } from '../../services/feedback.service';
import { FEEDBACK_PACK_METRICS, type FeedbackPackMetricDefinition } from './metrics';

export * from './manifest';
export * from './metrics';

export interface EnsureFeedbackPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: FeedbackPackMetricDefinition,
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
 * Idempotently registers the KAN-82 Feedback & NPS pack: the
 * `survey_response` event schema first (this pack's own metrics'
 * `fact_survey_response` dbt mart is built from it — same schema-before-
 * metrics ordering `ensureSaasMetricPackSchemasRegistered`/
 * `ensureSaasMetricPackRegistered` establish for `ad_spend`), then every
 * metric this pack declares. `nps_score` is formula-kind and references the
 * other three, so aggregation-kind metrics register first — mirrors the
 * SaaS pack's own two-phase ordering.
 */
export async function ensureFeedbackPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureFeedbackPackRegisteredResult> {
  await ensureSurveyResponseSchemaRegistered({ organizationId, projectId, createdByUserId });

  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const aggregationMetrics = FEEDBACK_PACK_METRICS.filter((metric) => metric.definition.kind === 'aggregation');
  const formulaMetrics = FEEDBACK_PACK_METRICS.filter((metric) => metric.definition.kind === 'formula');

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
