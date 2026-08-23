import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { ensureFirmographicSchemaRegistered } from '../../services/firmographic.service';
import { FIRMOGRAPHIC_PACK_METRICS, type FirmographicPackMetricDefinition } from './metrics';

export * from './manifest';
export * from './metrics';

export interface EnsureFirmographicPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: FirmographicPackMetricDefinition,
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
 * Idempotently registers the KAN-87 Firmographic Enrichment pack: the
 * `company_firmographic` event schema first (this pack's own metrics'
 * `fact_company_firmographic` dbt mart is built from it — same
 * schema-before-metrics ordering `ensureChurnReasonPackRegistered`/KAN-84
 * establishes), then both `firmographic_profiles_total`/
 * `firmographic_mrr_total` metrics.
 */
export async function ensureFirmographicPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureFirmographicPackRegisteredResult> {
  await ensureFirmographicSchemaRegistered({ organizationId, projectId, createdByUserId });

  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const outcomes = await Promise.all(
    FIRMOGRAPHIC_PACK_METRICS.map((metric) => registerOne(organizationId, projectId, createdByUserId, metric)),
  );
  FIRMOGRAPHIC_PACK_METRICS.forEach((metric, index) => {
    (outcomes[index] === 'registered' ? registered : alreadyRegistered).push(metric.name);
  });

  return { registered, alreadyRegistered };
}
