import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { ensureSaasMetricPackSchemasRegistered } from '../saas-metric-pack';
import {
  CAMPAIGN_OPS_PACK_CALIBRATION_AGGREGATION_METRICS,
  CAMPAIGN_OPS_PACK_CALIBRATION_FORMULA_METRICS,
  CAMPAIGN_OPS_PACK_METRICS,
  CAMPAIGN_OPS_PACK_ROI_FORMULA_METRICS,
  type CampaignOpsPackMetricDefinition,
} from './metrics';

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

async function registerPhase(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metrics: readonly CampaignOpsPackMetricDefinition[],
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
 * Idempotently registers the KAN-86 Campaign Ops pack: the SaaS pack's own
 * `ad_spend` measure schema first (idempotently — same posture
 * `ensureQualityScorePackRegistered` already establishes for the identical
 * cross-pack `ad_spend` reuse), then `collection_Nd` + the reused `ad_spend`
 * metric (all aggregation-kind, so they can register together), then the
 * `roi_Nd` formulas (each needs its own `collection_Nd` and `ad_spend`
 * already active), then the predicted-vs-actual calibration metrics across
 * two further ordered phases (see `metrics.ts`'s own doc comment for why
 * each formula phase needs its references already active).
 */
export async function ensureCampaignOpsPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureCampaignOpsPackRegisteredResult> {
  await ensureSaasMetricPackSchemasRegistered(organizationId, projectId, createdByUserId);

  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const collection = await registerPhase(organizationId, projectId, createdByUserId, CAMPAIGN_OPS_PACK_METRICS);
  registered.push(...collection.registered);
  alreadyRegistered.push(...collection.alreadyRegistered);

  const roi = await registerPhase(organizationId, projectId, createdByUserId, CAMPAIGN_OPS_PACK_ROI_FORMULA_METRICS);
  registered.push(...roi.registered);
  alreadyRegistered.push(...roi.alreadyRegistered);

  const calibrationPhase1 = await registerPhase(organizationId, projectId, createdByUserId, CAMPAIGN_OPS_PACK_CALIBRATION_AGGREGATION_METRICS);
  registered.push(...calibrationPhase1.registered);
  alreadyRegistered.push(...calibrationPhase1.alreadyRegistered);

  const calibrationPhase2 = await registerPhase(organizationId, projectId, createdByUserId, CAMPAIGN_OPS_PACK_CALIBRATION_FORMULA_METRICS);
  registered.push(...calibrationPhase2.registered);
  alreadyRegistered.push(...calibrationPhase2.alreadyRegistered);

  return { registered, alreadyRegistered };
}
