import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { ensureSupportTicketSchemaRegistered } from '../../services/support.service';
import { SUPPORT_PACK_AGGREGATION_METRICS, SUPPORT_PACK_FORMULA_METRICS, type SupportPackMetricDefinition } from './metrics';

export * from './manifest';
export * from './metrics';

export interface EnsureSupportPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: SupportPackMetricDefinition,
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
  metrics: readonly SupportPackMetricDefinition[],
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
 * Idempotently registers the KAN-90 Customer Support pack: the
 * `support_ticket_event` schema first (this pack's own metrics' `fact_support_ticket_event`
 * dbt mart is built from it — same schema-before-metrics ordering
 * `ensureExperimentPackRegistered`/KAN-89 establishes), then the aggregation
 * metrics, then the `support_open_backlog` formula (see `metrics.ts`'s own
 * doc comment for why the formula phase needs the aggregation phase already
 * active).
 */
export async function ensureSupportPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureSupportPackRegisteredResult> {
  await ensureSupportTicketSchemaRegistered({ organizationId, projectId, createdByUserId });

  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const aggregationPhase = await registerPhase(organizationId, projectId, createdByUserId, SUPPORT_PACK_AGGREGATION_METRICS);
  registered.push(...aggregationPhase.registered);
  alreadyRegistered.push(...aggregationPhase.alreadyRegistered);

  const formulaPhase = await registerPhase(organizationId, projectId, createdByUserId, SUPPORT_PACK_FORMULA_METRICS);
  registered.push(...formulaPhase.registered);
  alreadyRegistered.push(...formulaPhase.alreadyRegistered);

  return { registered, alreadyRegistered };
}
