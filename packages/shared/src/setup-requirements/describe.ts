import { getSetupRequirement, SETUP_REJECTED_RECORDS_RECOMMENDATION } from './catalog';
import type {
  SetupEnvironmentHealth,
  SetupHealthReport,
  SetupRecommendation,
  SetupRequirementEnvironmentResult,
  SetupRequirementId,
  SetupSchemaEvidence,
} from './types';

/**
 * The MCP tools' output, built here so it can be tested without a server. Every sentence is plain
 * English composed at this point: the unmerged predecessor returned translation keys
 * ("SetupRequirements.webSdkImpact") as its impact_summary, which an agent can only repeat back.
 */

export interface SetupOutputContext {
  organizationId: string;
  projectId: string;
  /** The deployment's web app base URL (`GROWTHOS_WEB_APP_URL`). */
  webAppUrl: string;
  /** The deployment's API base URL (`GROWTHOS_API_BASE_URL`). */
  apiBaseUrl: string;
  /**
   * False when the credential is bound to one environment and the report was evaluated for that
   * environment alone: other environments' status is then unknown to the output, not "not connected".
   */
  otherEnvironmentsVisible?: boolean;
}

export interface RenderedSetupStep {
  action: string;
  web_page_url?: string;
  api_endpoint?: string;
  mcp_tool?: string;
}

/** The locale the English tool output links into. */
const LINK_LOCALE = 'en';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function renderSetupRecommendation(recommendation: SetupRecommendation, context: SetupOutputContext): RenderedSetupStep {
  if (recommendation.kind === 'web_page') {
    const path = recommendation.path.replace(':orgId', context.organizationId).replace(':projectId', context.projectId);
    return { action: recommendation.action, web_page_url: `${trimTrailingSlash(context.webAppUrl)}/${LINK_LOCALE}${path}` };
  }
  if (recommendation.kind === 'api_endpoint') {
    return { action: recommendation.action, api_endpoint: `${recommendation.method} ${trimTrailingSlash(context.apiBaseUrl)}${recommendation.path}` };
  }
  return { action: recommendation.action, mcp_tool: recommendation.tool };
}

function joinNames(schemas: readonly SetupSchemaEvidence[]): string {
  return schemas.map((schema) => `"${schema.name}"`).join(', ');
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** One sentence saying what was seen for a requirement in one environment, and so why it has its status. */
export function describeSetupRequirementResult(result: SetupRequirementEnvironmentResult, environmentName: string): string {
  const rejectedCount = result.rejectedSchemas.reduce((sum, schema) => sum + schema.openQuarantinedCount, 0);
  const reasons = result.quarantineReasons.length > 0 ? ` Reasons: ${result.quarantineReasons.join('; ')}.` : '';

  if (result.status === 'connected') {
    const rejectedNote =
      rejectedCount > 0 ? ` ${plural(rejectedCount, 'other record is', 'other records are')} rejected and open in quarantine (${joinNames(result.rejectedSchemas)}).${reasons}` : '';
    return `Accepted records seen in ${environmentName} for ${joinNames(result.acceptedSchemas)}, latest at ${result.lastAcceptedAt}.${rejectedNote}`;
  }
  if (result.status === 'error') {
    return `No accepted records in ${environmentName}: ${plural(rejectedCount, 'record was', 'records were')} rejected and ${rejectedCount === 1 ? 'is' : 'are'} open in quarantine (${joinNames(result.rejectedSchemas)}).${reasons}`;
  }
  const silent =
    result.silentRegisteredSchemas.length > 0
      ? ` Registered but never received here: ${result.silentRegisteredSchemas.map((name) => `"${name}"`).join(', ')}.`
      : '';
  return `No records seen in ${environmentName}, accepted or rejected.${silent}`;
}

function summarizeEnvironment(environment: SetupEnvironmentHealth): string {
  const titles = (status: SetupRequirementEnvironmentResult['status']) =>
    environment.requirements.filter((result) => result.status === status).map((result) => getSetupRequirement(result.requirementId).title);
  const parts = [`${environment.environmentName}: ${environment.connectedCount} of ${environment.totalCount} setup requirements connected (${environment.score}%).`];
  const connected = titles('connected');
  const errors = titles('error');
  const gaps = titles('gap');
  if (connected.length > 0) parts.push(`Connected: ${connected.join(', ')}.`);
  if (errors.length > 0) parts.push(`Rejected records only: ${errors.join(', ')}.`);
  if (gaps.length > 0) parts.push(`Not connected: ${gaps.join(', ')}.`);
  return parts.join(' ');
}

export type SetupHealthLabel = 'healthy' | 'partial' | 'not_connected';

function healthLabel(environment: SetupEnvironmentHealth): SetupHealthLabel {
  if (environment.connectedCount === environment.totalCount) return 'healthy';
  return environment.connectedCount === 0 ? 'not_connected' : 'partial';
}

export const SETUP_STATUS_SOURCE_NOTE =
  'Each status is derived from the ingest records this environment actually accepted (landed raw records) or rejected (open quarantine). Nothing can be marked connected by hand, and each environment is judged on its own traffic.';

/**
 * The environment a tool reports on: the one the caller named, else the API key's own environment,
 * else prod (the default every human-facing read uses). `undefined` only for a project with no
 * environments at all.
 */
export function selectSetupFocusEnvironment(
  report: SetupHealthReport,
  options: { environmentName?: string; environmentId?: string },
): SetupEnvironmentHealth | undefined {
  if (options.environmentName !== undefined) {
    return report.environments.find((environment) => environment.environmentName === options.environmentName);
  }
  if (options.environmentId !== undefined) {
    const bound = report.environments.find((environment) => environment.environmentId === options.environmentId);
    if (bound) return bound;
  }
  return report.environments.find((environment) => environment.environmentName === 'prod') ?? report.environments[0];
}

/** `get_setup_health`: the focus environment in detail, every environment in one line each. */
export function buildSetupHealthOutput(report: SetupHealthReport, focus: SetupEnvironmentHealth, context: SetupOutputContext) {
  return {
    project_id: context.projectId,
    environment: focus.environmentName,
    health: healthLabel(focus),
    score: focus.score,
    connected_count: focus.connectedCount,
    total_requirements: focus.totalCount,
    core_connected_count: focus.coreConnectedCount,
    core_total: focus.coreTotalCount,
    summary: summarizeEnvironment(focus),
    requirements: focus.requirements.map((result) => {
      const requirement = getSetupRequirement(result.requirementId);
      return {
        id: requirement.id,
        title: requirement.title,
        importance: requirement.importance,
        status: result.status,
        detail: describeSetupRequirementResult(result, focus.environmentName),
        last_accepted_at: result.lastAcceptedAt,
      };
    }),
    environments: report.environments.map((environment) => ({
      environment: environment.environmentName,
      health: healthLabel(environment),
      score: environment.score,
      connected_count: environment.connectedCount,
      total_requirements: environment.totalCount,
      summary: summarizeEnvironment(environment),
    })),
    status_source: SETUP_STATUS_SOURCE_NOTE,
    next_step: 'Call audit_installation_gaps for what each missing requirement costs and how to connect it.',
  };
}

function connectedElsewhere(report: SetupHealthReport, focus: SetupEnvironmentHealth, requirementId: SetupRequirementId): string[] {
  return report.environments
    .filter((environment) => environment.environmentId !== focus.environmentId)
    .filter((environment) => environment.requirements.some((result) => result.requirementId === requirementId && result.status === 'connected'))
    .map((environment) => environment.environmentName);
}

/** `audit_installation_gaps`: every requirement not connected in the focus environment, with its cost and the steps to connect it. */
export function buildInstallationGapsOutput(report: SetupHealthReport, focus: SetupEnvironmentHealth, context: SetupOutputContext) {
  const gaps = focus.requirements
    .filter((result) => result.status !== 'connected')
    .map((result) => {
      const requirement = getSetupRequirement(result.requirementId);
      const steps = result.status === 'error' ? [SETUP_REJECTED_RECORDS_RECOMMENDATION, ...requirement.recommendations] : requirement.recommendations;
      return {
        requirement_id: requirement.id,
        title: requirement.title,
        importance: requirement.importance,
        status: result.status,
        detail: describeSetupRequirementResult(result, focus.environmentName),
        impact_summary: requirement.impact,
        satisfied_by: requirement.satisfiedBy,
        // null, not []: a credential bound to one environment cannot see the others, and an empty
        // list would read as "connected nowhere else".
        connected_in_other_environments: context.otherEnvironmentsVisible === false ? null : connectedElsewhere(report, focus, requirement.id),
        how_to_fix: steps.map((step) => renderSetupRecommendation(step, context)),
      };
    });

  const connected = focus.requirements
    .filter((result) => result.status === 'connected')
    .map((result) => ({
      requirement_id: result.requirementId,
      title: getSetupRequirement(result.requirementId).title,
      schemas: result.acceptedSchemas.map((schema) => schema.name),
      last_accepted_at: result.lastAcceptedAt,
      detail: describeSetupRequirementResult(result, focus.environmentName),
    }));

  return {
    project_id: context.projectId,
    environment: focus.environmentName,
    summary: summarizeEnvironment(focus),
    unresolved_gaps_count: gaps.length,
    gaps,
    connected,
    status_source: SETUP_STATUS_SOURCE_NOTE,
  };
}
