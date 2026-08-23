import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { ensureSaasMetricPackSchemasRegistered } from '../saas-metric-pack';
import { ensureOnboardingSurveySchemaRegistered } from './schemas';
import {
  QUALITY_SCORE_PACK_AGGREGATION_METRICS,
  QUALITY_SCORE_PACK_PHASE_2_FORMULA_METRICS,
  QUALITY_SCORE_PACK_PHASE_3_FORMULA_METRICS,
  type QualityScorePackMetricDefinition,
} from './metrics';

export * from './manifest';
export * from './metrics';
export * from './schemas';

export interface EnsureQualityScorePackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page, or the SaaS pack itself for `ad_spend`) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: QualityScorePackMetricDefinition,
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

async function registerPhase(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metrics: readonly QualityScorePackMetricDefinition[],
): Promise<{ registered: string[]; alreadyRegistered: string[] }> {
  const outcomes = await Promise.all(metrics.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)));
  const registered: string[] = [];
  const alreadyRegistered: string[] = [];
  metrics.forEach((metric, index) => {
    (outcomes[index] === 'registered' ? registered : alreadyRegistered).push(metric.name);
  });
  return { registered, alreadyRegistered };
}

/**
 * Idempotently registers the KAN-83 Intent & Quality Scoring pack: the
 * `onboarding_survey` event schema first, then the SaaS pack's own
 * `ad_spend` measure schema (idempotently — `ensureSaasMetricPackSchemasRegistered`
 * is itself already safe to call whether or not the SaaS pack is installed
 * in this project), then this pack's metrics across three ordered phases
 * (see `metrics.ts`'s own doc comment for why formula-kind metrics need
 * their references to already be active). Every step is retry-safe, the
 * same posture `ensureChurnReasonPackRegistered`/`ensureSaasMetricPackRegistered`
 * already establish: a partial failure just leaves some names registered and
 * some not, and a re-call converges the rest without re-registering anything
 * that already landed.
 */
export async function ensureQualityScorePackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureQualityScorePackRegisteredResult> {
  await ensureOnboardingSurveySchemaRegistered(organizationId, projectId, createdByUserId);
  await ensureSaasMetricPackSchemasRegistered(organizationId, projectId, createdByUserId);

  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const phase1 = await registerPhase(organizationId, projectId, createdByUserId, QUALITY_SCORE_PACK_AGGREGATION_METRICS);
  registered.push(...phase1.registered);
  alreadyRegistered.push(...phase1.alreadyRegistered);

  const phase2 = await registerPhase(organizationId, projectId, createdByUserId, QUALITY_SCORE_PACK_PHASE_2_FORMULA_METRICS);
  registered.push(...phase2.registered);
  alreadyRegistered.push(...phase2.alreadyRegistered);

  const phase3 = await registerPhase(organizationId, projectId, createdByUserId, QUALITY_SCORE_PACK_PHASE_3_FORMULA_METRICS);
  registered.push(...phase3.registered);
  alreadyRegistered.push(...phase3.alreadyRegistered);

  return { registered, alreadyRegistered };
}
