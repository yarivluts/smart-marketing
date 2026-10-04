import { ProjectModel } from '../models/project.model';
import type { RawRecordModel } from '../models/raw-record.model';
import { ProjectNotFoundError } from './resource-library.service';
import { checkRecordEnvelope, ingestBatch } from './ingest.service';
import { listRecentRecordsForSchemas } from './pipeline.service';
import type { SchemaFieldInput } from './schema-registry.service';
import { DuplicateSchemaDefinitionError, registerSchemaDefinition } from './schema-registry.service';

/** Schema name for ad creative asset-level performance telemetry (KAN-305, Stitch 6bf1b35b). */
export const AD_CREATIVE_INSIGHT_EVENT_NAME = 'ad_creative_insight';

export type CreativeFatigueLevel = 'fresh' | 'wearing_out' | 'fatigued';
export type CreativeSwapAction = 'scale' | 'review' | 'auto_swap';

export interface CreativeFatigueItem {
  id: string;
  creativeId: string;
  creativeName: string;
  campaignId: string | null;
  adSetId: string | null;
  channel: 'meta' | 'google' | 'tiktok' | string;
  impressions: number;
  clicks: number;
  reach: number;
  spend: number;
  frequency: number;
  currentCtrPct: number;
  baselineCtrPct: number;
  decayPct: number;
  fatigueLevel: CreativeFatigueLevel;
  recommendedAction: CreativeSwapAction;
  thumbnailUrl: string | null;
  status: string;
  landedAt: string;
}

export interface CreativeFatigueTelemetryResult {
  hasData: boolean;
  totalCreatives: number;
  freshCount: number;
  wearingOutCount: number;
  fatiguedCount: number;
  avgDecayRatePct: number;
  avgFrequency: number;
  budgetAtRisk: number;
  creatives: CreativeFatigueItem[];
}

export const AD_CREATIVE_INSIGHT_FIELDS: SchemaFieldInput[] = [
  { name: 'creative_id', type: 'string', isRequired: true, isPii: false, isIdentityKey: true },
  { name: 'creative_name', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'campaign_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'ad_set_id', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'channel', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'impressions', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'clicks', type: 'number', isRequired: true, isPii: false, isIdentityKey: false },
  { name: 'reach', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'spend', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'frequency', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'baseline_ctr', type: 'number', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'thumbnail_url', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
  { name: 'status', type: 'string', isRequired: false, isPii: false, isIdentityKey: false },
];

/**
 * Idempotently registers the `ad_creative_insight` schema for a project.
 */
export async function ensureCreativeInsightSchemaRegistered(
  organizationId: string,
  projectId: string,
  createdByUserId: string,
): Promise<void> {
  try {
    await registerSchemaDefinition({
      organizationId,
      projectId,
      kind: 'event',
      name: AD_CREATIVE_INSIGHT_EVENT_NAME,
      fields: AD_CREATIVE_INSIGHT_FIELDS,
      createdByUserId,
    });
  } catch (error) {
    if (error instanceof DuplicateSchemaDefinitionError) {
      return;
    }
    throw error;
  }
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/**
 * Pure function that aggregates raw `ad_creative_insight` records into creative fatigue radar metrics,
 * calculating frequency saturation, decay velocity against baseline CTR, and swap recommendations.
 */
export function aggregateCreativeFatigueTelemetry(
  records: readonly RawRecordModel[],
): CreativeFatigueTelemetryResult {
  if (records.length === 0) {
    return {
      hasData: false,
      totalCreatives: 0,
      freshCount: 0,
      wearingOutCount: 0,
      fatiguedCount: 0,
      avgDecayRatePct: 0,
      avgFrequency: 0,
      budgetAtRisk: 0,
      creatives: [],
    };
  }

  // Deduplicate by creativeId, keeping the most recent landed snapshot
  const latestByCreative = new Map<string, { record: RawRecordModel; properties: Record<string, unknown> }>();

  for (const record of records) {
    const { fieldsToValidate: properties } = checkRecordEnvelope('event', record.payload);
    const creativeId = typeof properties.creative_id === 'string' ? properties.creative_id : '';
    if (!creativeId) continue;

    const existing = latestByCreative.get(creativeId);
    if (!existing || record.landed_at > existing.record.landed_at) {
      latestByCreative.set(creativeId, { record, properties });
    }
  }

  if (latestByCreative.size === 0) {
    return {
      hasData: false,
      totalCreatives: 0,
      freshCount: 0,
      wearingOutCount: 0,
      fatiguedCount: 0,
      avgDecayRatePct: 0,
      avgFrequency: 0,
      budgetAtRisk: 0,
      creatives: [],
    };
  }

  const items: CreativeFatigueItem[] = [];
  let totalDecayRate = 0;
  let totalFrequency = 0;
  let totalBudgetAtRisk = 0;
  let freshCount = 0;
  let wearingOutCount = 0;
  let fatiguedCount = 0;

  for (const [creativeId, { record, properties }] of latestByCreative.entries()) {
    const creativeName = typeof properties.creative_name === 'string' && properties.creative_name.trim().length > 0
      ? properties.creative_name
      : `Creative ${creativeId}`;
    const campaignId = typeof properties.campaign_id === 'string' ? properties.campaign_id : null;
    const adSetId = typeof properties.ad_set_id === 'string' ? properties.ad_set_id : null;
    const channel = typeof properties.channel === 'string' ? properties.channel.toLowerCase() : 'meta';
    const impressions = typeof properties.impressions === 'number' ? properties.impressions : Number(properties.impressions ?? 0);
    const clicks = typeof properties.clicks === 'number' ? properties.clicks : Number(properties.clicks ?? 0);
    const reach = typeof properties.reach === 'number' ? properties.reach : Number(properties.reach ?? 0);
    const spend = typeof properties.spend === 'number' ? properties.spend : Number(properties.spend ?? 0);
    const status = typeof properties.status === 'string' ? properties.status : 'active';
    const thumbnailUrl = typeof properties.thumbnail_url === 'string' ? properties.thumbnail_url : null;

    // Calculate frequency: reach > 0 ? impressions / reach : explicit frequency field or default 1.0
    let frequency = 1.0;
    if (reach > 0) {
      frequency = Number((impressions / reach).toFixed(2));
    } else if (typeof properties.frequency === 'number') {
      frequency = Number(properties.frequency.toFixed(2));
    }

    // Calculate CTR: clicks / impressions
    let currentCtrPct = 0;
    if (impressions > 0) {
      currentCtrPct = Number(((clicks / impressions) * 100).toFixed(2));
    } else if (typeof properties.ctr === 'number') {
      currentCtrPct = properties.ctr > 1 ? Number(properties.ctr.toFixed(2)) : Number((properties.ctr * 100).toFixed(2));
    }

    // Baseline CTR: explicit baseline or fallback to current
    let baselineCtrPct = currentCtrPct;
    if (typeof properties.baseline_ctr === 'number' && properties.baseline_ctr > 0) {
      baselineCtrPct = properties.baseline_ctr > 1
        ? Number(properties.baseline_ctr.toFixed(2))
        : Number((properties.baseline_ctr * 100).toFixed(2));
    }

    // Decay rate velocity: ((baseline - current) / baseline) * 100
    let decayPct = 0;
    if (baselineCtrPct > 0) {
      decayPct = Number((((baselineCtrPct - currentCtrPct) / baselineCtrPct) * 100).toFixed(1));
    }

    // Classify fatigue level and recommended action:
    let fatigueLevel: CreativeFatigueLevel = 'fresh';
    let recommendedAction: CreativeSwapAction = 'scale';

    if (decayPct >= 35 || frequency >= 4.0) {
      fatigueLevel = 'fatigued';
      recommendedAction = 'auto_swap';
      fatiguedCount++;
      totalBudgetAtRisk += spend;
    } else if (decayPct >= 15 || frequency >= 2.5) {
      fatigueLevel = 'wearing_out';
      recommendedAction = 'review';
      wearingOutCount++;
      totalBudgetAtRisk += spend * 0.5;
    } else {
      fatigueLevel = 'fresh';
      recommendedAction = 'scale';
      freshCount++;
    }

    totalDecayRate += Math.max(0, decayPct);
    totalFrequency += frequency;

    const envelopeTs = record.payload.ts;
    const landedAt = typeof envelopeTs === 'string' && envelopeTs.trim().length > 0 ? envelopeTs : record.landed_at;

    items.push({
      id: record.id,
      creativeId,
      creativeName,
      campaignId,
      adSetId,
      channel,
      impressions,
      clicks,
      reach,
      spend,
      frequency,
      currentCtrPct,
      baselineCtrPct,
      decayPct,
      fatigueLevel,
      recommendedAction,
      thumbnailUrl,
      status,
      landedAt,
    });
  }

  // Sort highest decay first
  items.sort((a, b) => b.decayPct - a.decayPct);

  const totalCreatives = items.length;
  const avgDecayRatePct = Number((totalDecayRate / totalCreatives).toFixed(1));
  const avgFrequency = Number((totalFrequency / totalCreatives).toFixed(2));

  return {
    hasData: true,
    totalCreatives,
    freshCount,
    wearingOutCount,
    fatiguedCount,
    avgDecayRatePct,
    avgFrequency,
    budgetAtRisk: Number(totalBudgetAtRisk.toFixed(2)),
    creatives: items,
  };
}

/**
 * Retrieves creative fatigue radar telemetry for a project (KAN-305).
 */
export async function getCreativeFatigueTelemetryForProject(
  organizationId: string,
  projectId: string,
  options?: { limit?: number },
): Promise<CreativeFatigueTelemetryResult> {
  await requireProjectInOrg(organizationId, projectId);

  const limit = options?.limit ?? 300;

  const records = await listRecentRecordsForSchemas({
    organizationId,
    projectId,
    kind: 'event',
    schemaNames: [AD_CREATIVE_INSIGHT_EVENT_NAME],
    limit,
  });

  return aggregateCreativeFatigueTelemetry(records);
}

export interface SyncCreativeMetricInput {
  creativeId: string;
  creativeName?: string;
  campaignId?: string;
  adSetId?: string;
  channel?: string;
  impressions: number;
  clicks: number;
  reach?: number;
  spend?: number;
  frequency?: number;
  baselineCtr?: number;
  thumbnailUrl?: string;
  status?: string;
}

/**
 * Ingests ad creative frequency and performance snapshots from ad networks (Meta / Google / TikTok).
 */
export async function ingestCreativeFatigueMetrics(
  organizationId: string,
  projectId: string,
  environmentId: string,
  metrics: SyncCreativeMetricInput[],
): Promise<{ accepted: number; batchId: string }> {
  await requireProjectInOrg(organizationId, projectId);

  const nowIso = new Date().toISOString();
  const records = metrics.map((m) => ({
    client_id: `creative_${m.creativeId}_${Date.now()}`,
    schema_name: AD_CREATIVE_INSIGHT_EVENT_NAME,
    payload: {
      event_id: `evt_creative_${m.creativeId}_${Date.now()}`,
      event: AD_CREATIVE_INSIGHT_EVENT_NAME,
      ts: nowIso,
      properties: {
        creative_id: m.creativeId,
        creative_name: m.creativeName ?? m.creativeId,
        campaign_id: m.campaignId ?? null,
        ad_set_id: m.adSetId ?? null,
        channel: m.channel ?? 'meta',
        impressions: m.impressions,
        clicks: m.clicks,
        reach: m.reach ?? (m.frequency && m.frequency > 0 ? Math.round(m.impressions / m.frequency) : m.impressions),
        spend: m.spend ?? 0,
        frequency: m.frequency ?? 1.0,
        baseline_ctr: m.baselineCtr ?? (m.impressions > 0 ? m.clicks / m.impressions : 0.02),
        thumbnail_url: m.thumbnailUrl ?? null,
        status: m.status ?? 'active',
      },
    },
  }));

  const result = await ingestBatch({
    organizationId,
    projectId,
    environmentId,
    input: {
      kind: 'event',
      records,
    },
  });

  return { accepted: result.accepted, batchId: result.batchId };
}
