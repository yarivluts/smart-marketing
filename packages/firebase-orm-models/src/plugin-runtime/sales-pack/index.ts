import { DuplicateMetricDefinitionError, registerMetricDefinition } from '../../services/metric-registry.service';
import { ensureDemoEventSchemaRegistered } from '../../services/sales.service';
import { SALES_PACK_AGGREGATION_METRICS, SALES_PACK_FORMULA_METRICS, type SalesPackMetricDefinition } from './metrics';

export * from './manifest';
export * from './metrics';

export interface EnsureSalesPackRegisteredResult {
  /** Metric names newly registered by this call. */
  registered: string[];
  /** Metric names that were already registered by a prior call (or a human, via the Metric Defs admin page) — not an error. */
  alreadyRegistered: string[];
}

async function registerOne(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
  metric: SalesPackMetricDefinition,
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
  metrics: readonly SalesPackMetricDefinition[],
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
 * Idempotently registers the KAN-92 Sales Pipeline pack: the `demo_event`
 * schema first (this pack's own metrics' `fact_demo_event` dbt mart is
 * built from it — same schema-before-metrics ordering `ensureSupportPackRegistered`
 * (KAN-90) establishes), then the aggregation metrics, then the
 * `demo_show_rate` formula (see `metrics.ts`'s own doc comment for why the
 * formula phase needs the aggregation phase already active).
 */
export async function ensureSalesPackRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<EnsureSalesPackRegisteredResult> {
  await ensureDemoEventSchemaRegistered({ organizationId, projectId, createdByUserId });

  const registered: string[] = [];
  const alreadyRegistered: string[] = [];

  const aggregationPhase = await registerPhase(organizationId, projectId, createdByUserId, SALES_PACK_AGGREGATION_METRICS);
  registered.push(...aggregationPhase.registered);
  alreadyRegistered.push(...aggregationPhase.alreadyRegistered);

  const formulaPhase = await registerPhase(organizationId, projectId, createdByUserId, SALES_PACK_FORMULA_METRICS);
  registered.push(...formulaPhase.registered);
  alreadyRegistered.push(...formulaPhase.alreadyRegistered);

  return { registered, alreadyRegistered };
}
