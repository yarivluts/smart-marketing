import {
  computeMultiTouchAttributionMatrix,
  getBaselineAttributionTelemetry,
  DEFAULT_SENSITIVITY_CONFIG,
  type AttributionSensitivityConfig,
  type AttributionTelemetryResult,
  type CustomerJourneyRecord,
} from '@growthos/shared';
import { ProjectModel } from '../models/project.model';
import { RawRecordModel } from '../models/raw-record.model';
import { ProjectNotFoundError } from './resource-library.service';

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export interface GetAttributionTelemetryOptions {
  lookbackDays?: 30 | 60 | 90;
  halfLifeDays?: number;
  wShapedFirstWeight?: number;
  wShapedMiddleWeight?: number;
  wShapedLastWeight?: number;
}

/**
 * Retrieves multi-touch attribution telemetry for a project.
 * Runs Markov chain removal effects and Shapley game-theoretic cooperative marginal contributions.
 */
export async function getAttributionTelemetry(
  organizationId: string,
  projectId: string,
  options?: GetAttributionTelemetryOptions,
): Promise<AttributionTelemetryResult> {
  const lookbackDays = options?.lookbackDays ?? 60;
  const config: AttributionSensitivityConfig = {
    lookbackDays,
    halfLifeDays: options?.halfLifeDays ?? DEFAULT_SENSITIVITY_CONFIG.halfLifeDays,
    wShapedFirstWeight: options?.wShapedFirstWeight ?? DEFAULT_SENSITIVITY_CONFIG.wShapedFirstWeight,
    wShapedMiddleWeight: options?.wShapedMiddleWeight ?? DEFAULT_SENSITIVITY_CONFIG.wShapedMiddleWeight,
    wShapedLastWeight: options?.wShapedLastWeight ?? DEFAULT_SENSITIVITY_CONFIG.wShapedLastWeight,
  };

  if (organizationId === 'demo-org' || projectId === 'demo-project') {
    return getBaselineAttributionTelemetry(lookbackDays);
  }

  await requireProjectInOrg(organizationId, projectId);

  const lookbackMs = lookbackDays * 86_400_000;
  const cutoffIso = new Date(Date.now() - lookbackMs).toISOString();

  try {
    // Attempt to query recent events from RawRecordModel within lookback window
    const rawRecords = await RawRecordModel.initPath({ organization_id: organizationId, project_id: projectId })
      .where('project_id', '==', projectId)
      .where('landed_at', '>=', cutoffIso)
      .limit(500)
      .get();

    if (!rawRecords || rawRecords.length === 0) {
      // Graceful fallback to baseline telemetry
      return getBaselineAttributionTelemetry(lookbackDays);
    }

    // Group raw touchpoints and conversions into customer journeys
    const customerJourneysMap = new Map<string, CustomerJourneyRecord>();

    for (const record of rawRecords) {
      const payload = record.payload as any;
      if (!payload) continue;

      const customerId = payload.customer_id || payload.user_id || payload.anon_id || record.id;
      const ts = payload.ts ? new Date(payload.ts).getTime() : new Date(record.landed_at).getTime();

      let journey = customerJourneysMap.get(customerId);
      if (!journey) {
        journey = {
          journeyId: `journey-${customerId}`,
          customerId,
          touchpoints: [],
          converted: false,
          conversionRevenue: 0,
          conversionTimestamp: 0,
        };
        customerJourneysMap.set(customerId, journey);
      }

      const eventType = record.kind === 'event' ? payload.event || payload.event_type : 'touchpoint';
      const isTouchpoint = eventType === 'touchpoint' || payload.channel;

      if (isTouchpoint) {
        const channelId = payload.channel || 'direct_organic';
        journey.touchpoints.push({
          channelId,
          channelName: channelId.replace(/_/g, ' '),
          timestamp: ts,
          campaignId: payload.utm_campaign,
          landingPage: payload.landing_page,
        });
      } else {
        journey.converted = true;
        journey.conversionRevenue += Number(payload.revenue || payload.value || 100);
        journey.conversionTimestamp = Math.max(journey.conversionTimestamp, ts);
        journey.conversionEvent = eventType;
      }
    }

    const journeys = Array.from(customerJourneysMap.values());
    const convertedJourneys = journeys.filter((j) => j.converted && j.touchpoints.length > 0);

    if (convertedJourneys.length < 3) {
      return getBaselineAttributionTelemetry(lookbackDays);
    }

    return computeMultiTouchAttributionMatrix(journeys, config);
  } catch (_err) {
    return getBaselineAttributionTelemetry(lookbackDays);
  }
}
