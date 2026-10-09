import {
  computePeerBenchmarkTelemetry,
  type PeerBenchmarkFilterOptions,
  type PeerBenchmarksTelemetryResult,
  type ProjectMetricInputs,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { RawRecordModel } from '../models/raw-record.model';
import { ProjectNotFoundError } from './resource-library.service';

export type {
  ComparisonTarget,
  IndustryCohort,
  PeerBenchmarkFilterOptions,
  PeerBenchmarksTelemetryResult,
  SpendTier,
} from '@growthos/shared';

export interface PeerBenchmarkQueryOptions extends PeerBenchmarkFilterOptions {
  sampleMerchantCount?: number;
  now?: Date | string;
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/**
 * Extracts observed marketing and conversion metrics from bounded raw event records.
 * Falls back gracefully when records are sparse or not yet ingested.
 */
export function extractProjectObservedMetrics(
  records: readonly RawRecordModel[],
): ProjectMetricInputs {
  let totalSpend = 0;
  let totalRevenue = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalConversions = 0;
  let totalVisitors = 0;

  for (const record of records) {
    const payload = record.payload as Record<string, unknown> | undefined;
    if (!payload) continue;

    // Check ad performance or creative fatigue records
    if (typeof payload.spend === 'number' && payload.spend > 0) {
      totalSpend += payload.spend;
    }
    if (typeof payload.revenue === 'number' && payload.revenue > 0) {
      totalRevenue += payload.revenue;
    }
    if (typeof payload.clicks === 'number' && payload.clicks > 0) {
      totalClicks += payload.clicks;
    }
    if (typeof payload.impressions === 'number' && payload.impressions > 0) {
      totalImpressions += payload.impressions;
    }
    if (typeof payload.conversions === 'number' && payload.conversions > 0) {
      totalConversions += payload.conversions;
    }
    if (typeof payload.visitors === 'number' && payload.visitors > 0) {
      totalVisitors += payload.visitors;
    }

    // Check Stripe charge records
    if (record.schema_name === 'stripe_charge' && typeof payload.amount === 'number') {
      const amountDecimal = payload.amount > 100 ? payload.amount / 100 : payload.amount;
      totalRevenue += amountDecimal;
      totalConversions += 1;
    }
  }

  const result: ProjectMetricInputs = {};

  if (totalSpend > 0 && totalRevenue > 0) {
    result.roas = Number((totalRevenue / totalSpend).toFixed(2));
  }
  if (totalSpend > 0 && totalConversions > 0) {
    result.cac = Number((totalSpend / totalConversions).toFixed(2));
  }
  if (totalClicks > 0 && totalImpressions > 0) {
    result.ctr = Number(((totalClicks / totalImpressions) * 100).toFixed(2));
  }
  if (totalConversions > 0 && totalVisitors > 0) {
    result.conversionRate = Number(((totalConversions / totalVisitors) * 100).toFixed(2));
  }

  return result;
}

/**
 * Service to query cross-merchant cohort benchmarks for a project.
 * Implements privacy-preserving k-anonymity (k >= 5) and aggregates live project telemetry.
 */
export async function getPeerBenchmarksForProject(
  organizationId: string,
  projectId: string,
  options: PeerBenchmarkQueryOptions = {},
): Promise<PeerBenchmarksTelemetryResult> {
  await requireProjectInOrg(organizationId, projectId);

  // Read bounded recent event records to derive live project performance signals
  let rawRecords: RawRecordModel[] = [];
  try {
    rawRecords = await RawRecordModel.initPath({
      organization_id: organizationId,
      project_id: projectId,
    })
      .where('kind', '==', 'event')
      .limit(200)
      .get();
  } catch {
    // If Firestore collection is empty or warehouse not configured, fallback gracefully
    rawRecords = [];
  }

  const observed = extractProjectObservedMetrics(rawRecords);

  return computePeerBenchmarkTelemetry(observed, {
    industry: options.industry,
    spendTier: options.spendTier,
    comparisonTarget: options.comparisonTarget,
    sampleMerchantCount: options.sampleMerchantCount,
  });
}
