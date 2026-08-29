import type { MetricDefinitionInput } from '../../services/metric-registry.service';
import {
  DuplicateMetricDefinitionError,
  registerMetricDefinition,
} from '../../services/metric-registry.service';

export interface EasySignMetricDefinition {
  name: string;
  featured: boolean;
  dimensions: readonly string[];
  definition: MetricDefinitionInput;
}

export const EASYSIGN_DOCUMENTS_CREATED_NAME = 'easysign_documents_created';
export const EASYSIGN_SIGNINGS_VIEWED_NAME = 'easysign_signings_viewed';
export const EASYSIGN_DOCUMENTS_SIGNED_NAME = 'easysign_documents_signed';
export const EASYSIGN_DOCUMENTS_DECLINED_NAME = 'easysign_documents_declined';
export const EASYSIGN_COMPLETION_RATE_NAME = 'easysign_signing_completion_rate';
export const EASYSIGN_AVG_TURNAROUND_NAME = 'easysign_avg_turnaround_time_sec';

export const EASYSIGN_AGGREGATION_METRICS: EasySignMetricDefinition[] = [
  {
    name: EASYSIGN_DOCUMENTS_CREATED_NAME,
    featured: true,
    dimensions: ['signingTier'],
    definition: {
      kind: 'aggregation',
      aggregation: {
        function: 'count',
        table: 'events',
        column: 'event_id',
        timeColumn: 'ts',
        filters: [{ field: 'event_name', operator: '=', value: 'easysign.document_created' }],
      },
    },
  },
  {
    name: EASYSIGN_SIGNINGS_VIEWED_NAME,
    featured: true,
    dimensions: [],
    definition: {
      kind: 'aggregation',
      aggregation: {
        function: 'count',
        table: 'events',
        column: 'event_id',
        timeColumn: 'ts',
        filters: [{ field: 'event_name', operator: '=', value: 'easysign.signing_viewed' }],
      },
    },
  },
  {
    name: EASYSIGN_DOCUMENTS_SIGNED_NAME,
    featured: true,
    dimensions: ['signingTier'],
    definition: {
      kind: 'aggregation',
      aggregation: {
        function: 'count',
        table: 'events',
        column: 'event_id',
        timeColumn: 'ts',
        filters: [{ field: 'event_name', operator: '=', value: 'easysign.document_signed' }],
      },
    },
  },
  {
    name: EASYSIGN_DOCUMENTS_DECLINED_NAME,
    featured: false,
    dimensions: [],
    definition: {
      kind: 'aggregation',
      aggregation: {
        function: 'count',
        table: 'events',
        column: 'event_id',
        timeColumn: 'ts',
        filters: [{ field: 'event_name', operator: '=', value: 'easysign.document_declined' }],
      },
    },
  },
  {
    name: EASYSIGN_AVG_TURNAROUND_NAME,
    featured: true,
    dimensions: ['signingTier'],
    definition: {
      kind: 'aggregation',
      aggregation: {
        function: 'avg',
        table: 'events',
        column: 'signingDurationSec',
        timeColumn: 'ts',
        filters: [{ field: 'event_name', operator: '=', value: 'easysign.document_signed' }],
      },
    },
  },
];

export const EASYSIGN_FORMULA_METRICS: EasySignMetricDefinition[] = [
  {
    name: EASYSIGN_COMPLETION_RATE_NAME,
    featured: true,
    dimensions: [],
    definition: {
      kind: 'formula',
      formula: `(${EASYSIGN_DOCUMENTS_SIGNED_NAME} / ${EASYSIGN_DOCUMENTS_CREATED_NAME}) * 100`,
    },
  },
];


export const EASYSIGN_ALL_METRICS = [
  ...EASYSIGN_AGGREGATION_METRICS,
  ...EASYSIGN_FORMULA_METRICS,
] as const;

/**
 * Registers all EasySign metrics in two phases (aggregations first, then formulas).
 * Safe to call idempotently.
 */
export async function ensureEasySignMetricsRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId = 'system:easysign-plugin',
): Promise<void> {
  // Phase 1: Aggregations
  for (const metric of EASYSIGN_AGGREGATION_METRICS) {
    try {
      await registerMetricDefinition({
        organizationId,
        projectId,
        name: metric.name,
        definition: metric.definition,
        dimensions: metric.dimensions as unknown as string[],
        createdByUserId,
      });
    } catch (err) {
      if (err instanceof DuplicateMetricDefinitionError) {
        continue;
      }
      throw err;
    }
  }

  // Phase 2: Formulas
  for (const metric of EASYSIGN_FORMULA_METRICS) {
    try {
      await registerMetricDefinition({
        organizationId,
        projectId,
        name: metric.name,
        definition: metric.definition,
        dimensions: metric.dimensions as unknown as string[],
        createdByUserId,
      });
    } catch (err) {
      if (err instanceof DuplicateMetricDefinitionError) {
        continue;
      }
      throw err;
    }
  }
}

