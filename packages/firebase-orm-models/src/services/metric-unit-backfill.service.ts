import { OrganizationModel } from '../models/organization.model';
import { ProjectModel } from '../models/project.model';
import { MetricDefModel, type MetricAggregationDef } from '../models/metric-def.model';
import { builtinMetricUnit } from '../plugin-runtime/builtin-metric-units';
import { SAAS_METRIC_PACK_METRICS } from '../plugin-runtime/saas-metric-pack/metrics';
import { LANDING_PAGE_PACK_METRICS } from '../plugin-runtime/landing-page-pack/metrics';
import { ENGAGEMENT_PACK_METRICS } from '../plugin-runtime/engagement-pack/metrics';
import { EXPERIMENT_PACK_METRICS } from '../plugin-runtime/experiment-pack/metrics';
import { FEEDBACK_PACK_METRICS } from '../plugin-runtime/feedback-pack/metrics';
import { FIRMOGRAPHIC_PACK_METRICS } from '../plugin-runtime/firmographic-pack/metrics';
import { CHURN_REASON_PACK_METRICS } from '../plugin-runtime/churn-reason-pack/metrics';
import { QUALITY_SCORE_PACK_METRICS } from '../plugin-runtime/quality-score-pack/metrics';
import {
  CAMPAIGN_OPS_PACK_CALIBRATION_AGGREGATION_METRICS,
  CAMPAIGN_OPS_PACK_CALIBRATION_FORMULA_METRICS,
  CAMPAIGN_OPS_PACK_METRICS,
  CAMPAIGN_OPS_PACK_ROI_FORMULA_METRICS,
} from '../plugin-runtime/campaign-ops-pack/metrics';
import { SALES_PACK_METRICS } from '../plugin-runtime/sales-pack/metrics';
import { SUPPORT_PACK_METRICS } from '../plugin-runtime/support-pack/metrics';
import { EASYSIGN_ALL_METRICS } from '../plugin-runtime/easysign/metrics';
import type { MetricDefinitionInput } from './metric-registry.service';
import { recordAuditLogEntry } from './audit-log.service';

/** Every built-in pack's metric definitions, by name — what a registered metric is compared against before a unit is backfilled onto it. */
export function builtinPackMetricDefinitions(): Map<string, MetricDefinitionInput> {
  const all = [
    ...SAAS_METRIC_PACK_METRICS,
    ...LANDING_PAGE_PACK_METRICS,
    ...ENGAGEMENT_PACK_METRICS,
    ...EXPERIMENT_PACK_METRICS,
    ...FEEDBACK_PACK_METRICS,
    ...FIRMOGRAPHIC_PACK_METRICS,
    ...CHURN_REASON_PACK_METRICS,
    ...QUALITY_SCORE_PACK_METRICS,
    ...CAMPAIGN_OPS_PACK_METRICS,
    ...CAMPAIGN_OPS_PACK_ROI_FORMULA_METRICS,
    ...CAMPAIGN_OPS_PACK_CALIBRATION_AGGREGATION_METRICS,
    ...CAMPAIGN_OPS_PACK_CALIBRATION_FORMULA_METRICS,
    ...SALES_PACK_METRICS,
    ...SUPPORT_PACK_METRICS,
    ...EASYSIGN_ALL_METRICS,
  ];
  return new Map(all.map((metric) => [metric.name, metric.definition]));
}

function normalizeFormula(formula: string): string {
  return formula.replace(/\s+/g, '');
}

function sameAggregation(stored: MetricAggregationDef, pack: MetricAggregationDef | MetricDefinitionInput['aggregation']): boolean {
  if (!pack) {
    return false;
  }
  const filters = (entries: readonly { field: string; operator: string; value: string }[]) =>
    JSON.stringify(entries.map((filter) => [filter.field, filter.operator, filter.value]));
  return (
    stored.function === pack.function &&
    stored.table === pack.table &&
    (stored.column ?? '') === (pack.column ?? '') &&
    stored.timeColumn === pack.timeColumn &&
    filters(stored.filters ?? []) === filters(pack.filters ?? [])
  );
}

/**
 * Whether a registered metric still has exactly the definition its pack ships. A metric a human
 * evolved (say `lp_conversion_rate` rewritten to `lp_conversions / lp_visitors * 100`) may no longer
 * mean what the pack's unit says, so it is left alone.
 */
export function matchesBuiltinDefinition(metricDef: MetricDefModel, pack: MetricDefinitionInput): boolean {
  if (metricDef.definition_kind !== pack.kind) {
    return false;
  }
  if (pack.kind === 'formula') {
    return metricDef.formula !== undefined && normalizeFormula(metricDef.formula) === normalizeFormula(pack.formula);
  }
  return metricDef.aggregation !== undefined && sameAggregation(metricDef.aggregation, pack.aggregation);
}

export const METRIC_UNIT_BACKFILL_ACTOR_ID = 'system:kan-213-metric-unit-backfill';

export interface BackfillBuiltinMetricUnitsParams {
  /** Restrict to one organization; omit for every organization. */
  organizationId?: string;
  /** Restrict to one project (requires `organizationId`). */
  projectId?: string;
  /** Report what would change without writing. Defaults to `false`. */
  dryRun?: boolean;
}

export interface MetricUnitBackfillRef {
  organizationId: string;
  projectId: string;
  metricDefId: string;
  name: string;
  version: number;
  unit: string;
}

export interface BackfillBuiltinMetricUnitsResult {
  dryRun: boolean;
  scanned: number;
  updated: MetricUnitBackfillRef[];
  /** Built-in metric names whose active definition no longer matches the pack's, so no unit was assumed for them. */
  skippedCustomised: Omit<MetricUnitBackfillRef, 'unit'>[];
}

/**
 * KAN-213 one-off for projects that installed a built-in pack before metrics carried a unit: sets
 * the pack's unit on each ACTIVE built-in metric that has none, in place. Idempotent - a metric that
 * already has a unit (declared by a human or by an earlier run) is never touched, and neither is a
 * metric whose definition was changed from the pack's.
 *
 * In place rather than as a new version: a unit is display and validation metadata, not part of the
 * computation a historical dashboard pins, and evolving every pack metric in every project would bump
 * versions for nothing. Superseded and archived versions are left as they are.
 */
export async function backfillBuiltinMetricUnits(params: BackfillBuiltinMetricUnitsParams = {}): Promise<BackfillBuiltinMetricUnitsResult> {
  if (params.projectId !== undefined && params.organizationId === undefined) {
    throw new Error('projectId requires organizationId.');
  }
  const dryRun = params.dryRun ?? false;
  const packDefinitions = builtinPackMetricDefinitions();
  const organizationIds =
    params.organizationId !== undefined ? [params.organizationId] : (await OrganizationModel.getAll()).map((organization) => organization.id);

  let scanned = 0;
  const updated: MetricUnitBackfillRef[] = [];
  const skippedCustomised: Omit<MetricUnitBackfillRef, 'unit'>[] = [];
  for (const organizationId of organizationIds) {
    const projectIds =
      params.projectId !== undefined
        ? [params.projectId]
        : (await ProjectModel.initPath({ organization_id: organizationId }).where('organization_id', '==', organizationId).get()).map((project) => project.id);

    for (const projectId of projectIds) {
      const active = await MetricDefModel.initPath({ organization_id: organizationId, project_id: projectId }).where('status', '==', 'active').get();
      for (const metricDef of active) {
        scanned += 1;
        const unit = builtinMetricUnit(metricDef.name);
        const packDefinition = packDefinitions.get(metricDef.name);
        if (!unit || !packDefinition || metricDef.unit) {
          continue;
        }
        const ref = { organizationId, projectId, metricDefId: metricDef.id, name: metricDef.name, version: metricDef.version };
        if (!matchesBuiltinDefinition(metricDef, packDefinition)) {
          skippedCustomised.push(ref);
          continue;
        }
        updated.push({ ...ref, unit });
        if (dryRun) {
          continue;
        }
        metricDef.unit = unit;
        metricDef.setPathParams({ organization_id: organizationId, project_id: projectId });
        await metricDef.save();
        try {
          await recordAuditLogEntry({
            organizationId,
            projectId,
            actorType: 'system',
            actorId: METRIC_UNIT_BACKFILL_ACTOR_ID,
            action: 'metric_def.set_unit',
            targetType: 'metric_def',
            targetId: metricDef.id,
            summary: `Declared unit "${unit}" on built-in metric "${metricDef.name}" v${metricDef.version}`,
            after: { unit },
          });
        } catch {
          // Best-effort — audit logging must never fail the backfill.
        }
      }
    }
  }

  return { dryRun, scanned, updated, skippedCustomised };
}
