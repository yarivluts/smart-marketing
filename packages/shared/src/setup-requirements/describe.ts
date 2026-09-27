import { getSetupRequirement, SETUP_CUSTOMER_BACKFILL_RECOMMENDATIONS, SETUP_REJECTED_RECORDS_RECOMMENDATION } from './catalog';
import type {
  SetupCustomerBackfillRecommendation,
  SetupCustomerCoverage,
  SetupEnvironmentHealth,
  SetupHealthReport,
  SetupRecommendation,
  SetupRequirement,
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

/**
 * How a schema was assigned to a requirement. Today always inferred from the schema's kind and the
 * words in its name (`classifySchemaForSetupRequirement`), which can guess wrong - "order_viewed"
 * reads as billing - so every output says so and names the schemas behind each status, making a
 * wrong inference visible instead of a confident, unexplained "connected".
 */
export const SETUP_SCHEMA_MAPPING = 'inferred_from_schema_name';

export const SETUP_SCHEMA_MAPPING_NOTE =
  'Schemas are matched to requirements by their kind and the words in their name (for example "subscription_state_change" counts as billing, and any other event that is not a touchpoint, signup or billing event counts as product usage). The match is an inference: check the schemas listed under each requirement, since a name like "order_viewed" would be counted as billing.';

/** The schemas behind one requirement's status, by what was seen for each. */
function schemasBehind(result: SetupRequirementEnvironmentResult) {
  return {
    accepted: result.acceptedSchemas.map((schema) => schema.name),
    rejected: result.rejectedSchemas.map((schema) => schema.name),
    registered_but_silent: result.silentRegisteredSchemas,
  };
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

/**
 * The customer-coverage fields both tools return. `customer_backfill` sits at the top level, not
 * inside a gap, because the case it exists for is usually "connected": new signups send entities
 * while the customers from before the rollout never did.
 */
function customerCoverageOutput(focus: SetupEnvironmentHealth, context: SetupOutputContext, coverage: SetupCustomerCoverage | null | undefined) {
  const backfill = customerBackfillRecommendation(focus, coverage);
  return {
    customer_coverage: coverage
      ? {
          event_customers: coverage.eventCustomers,
          with_customer_record: Math.min(coverage.withCustomerRecord, coverage.eventCustomers),
          coverage_percent: coverage.eventCustomers > 0 ? Math.floor((Math.min(coverage.withCustomerRecord, coverage.eventCustomers) * 100) / coverage.eventCustomers) : null,
          threshold_percent: CUSTOMER_COVERAGE_THRESHOLD_PERCENT,
          source: "Warehouse core tables as of their last refresh: distinct properties.customer_id in each environment's events, and how many have a customer entity record.",
        }
      : null,
    ...(coverage ? {} : { customer_coverage_note: 'Customer coverage needs the warehouse, which could not be read for this project; only a customer entity that never arrived at all can be detected without it.' }),
    customer_backfill: backfill
      ? {
          basis: backfill.basis,
          reason: describeCustomerBackfillReason(backfill, focus.environmentName),
          ...(backfill.basis === 'coverage' ? { missing_customers: backfill.missing } : {}),
          how_to_fix: customerBackfillSteps(backfill, focus.environmentName).map((step) => renderSetupRecommendation(step, context)),
        }
      : null,
  };
}

/** `get_setup_health`: the focus environment in detail, every environment in one line each. `coverage`: see {@link SetupCustomerCoverage}; null when the warehouse could not be read. */
export function buildSetupHealthOutput(report: SetupHealthReport, focus: SetupEnvironmentHealth, context: SetupOutputContext, coverage?: SetupCustomerCoverage | null) {
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
        schemas: schemasBehind(result),
        mapping: SETUP_SCHEMA_MAPPING,
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
    schema_mapping: SETUP_SCHEMA_MAPPING_NOTE,
    ...customerCoverageOutput(focus, context, coverage),
    next_step: 'Call audit_installation_gaps for what each missing requirement costs and how to connect it.',
  };
}

function connectedElsewhere(report: SetupHealthReport, focus: SetupEnvironmentHealth, requirementId: SetupRequirementId): string[] {
  return report.environments
    .filter((environment) => environment.environmentId !== focus.environmentId)
    .filter((environment) => environment.requirements.some((result) => result.requirementId === requirementId && result.status === 'connected'))
    .map((environment) => environment.environmentName);
}

/** Below this share of event customers with a customer record, a backfill is recommended. */
export const CUSTOMER_COVERAGE_THRESHOLD_PERCENT = 90;

/**
 * Whether to recommend resending existing customers (the backfill loop), and on what evidence.
 *
 * With warehouse coverage: when fewer than {@link CUSTOMER_COVERAGE_THRESHOLD_PERCENT}% of the
 * distinct customers in this environment's events have a customer record. This is what catches the
 * usual rollout: the integration starts sending entities for new signups, so an entity "has
 * arrived", while every customer from before the rollout is still missing.
 *
 * Without it (warehouse not configured or unreadable): only the case visible from ingest alone -
 * events accepted but no customer entity ever received - and no count is estimated.
 *
 * Never when customer records are being rejected: a backfill would be rejected the same way, so
 * the rejection reasons come first.
 */
export function customerBackfillRecommendation(
  environment: SetupEnvironmentHealth,
  coverage: SetupCustomerCoverage | null | undefined,
): SetupCustomerBackfillRecommendation | null {
  const customers = environment.requirements.find((result) => result.requirementId === 'customer_profiles');
  if (!customers || customers.status === 'error') return null;
  if (coverage) {
    if (coverage.eventCustomers <= 0) return null;
    const withRecord = Math.min(coverage.withCustomerRecord, coverage.eventCustomers);
    if (withRecord * 100 >= coverage.eventCustomers * CUSTOMER_COVERAGE_THRESHOLD_PERCENT) return null;
    return {
      basis: 'coverage',
      eventCustomers: coverage.eventCustomers,
      withCustomerRecord: withRecord,
      missing: coverage.eventCustomers - withRecord,
      // Floored, so 89.9% never displays as the 90% it failed to reach.
      coveragePercent: Math.floor((withRecord * 100) / coverage.eventCustomers),
    };
  }
  if (customers.status !== 'gap') return null;
  const events = environment.requirements.flatMap((result) => result.acceptedSchemas.filter((schema) => schema.kind === 'event').map((schema) => schema.name));
  return events.length > 0 ? { basis: 'no_entity_yet', eventSchemas: [...new Set(events)] } : null;
}

/** One sentence saying why a backfill is recommended, from its evidence. */
export function describeCustomerBackfillReason(recommendation: SetupCustomerBackfillRecommendation, environmentName: string): string {
  if (recommendation.basis === 'coverage') {
    return `${recommendation.missing} of ${recommendation.eventCustomers} customers seen in ${environmentName} events (by properties.customer_id) have no customer record: ${recommendation.coveragePercent}% coverage, below ${CUSTOMER_COVERAGE_THRESHOLD_PERCENT}%. Their customer entities were never sent, typically because they signed up before the integration started sending them.`;
  }
  return `Events are already accepted in ${environmentName} (${recommendation.eventSchemas.map((name) => `"${name}"`).join(', ')}), so these customers exist in the integrator's system but no customer entity has arrived.`;
}

/** The backfill steps, the first one leading with why. */
function customerBackfillSteps(recommendation: SetupCustomerBackfillRecommendation, environmentName: string): SetupRecommendation[] {
  const [first, ...others] = SETUP_CUSTOMER_BACKFILL_RECOMMENDATIONS;
  return [{ ...first, action: `${describeCustomerBackfillReason(recommendation, environmentName)} ${first.action}` }, ...others];
}

/**
 * The steps that connect one requirement from where it stands. Rejected records: read their reasons
 * first. A customer backfill recommended: resend the existing customers first. Schemas already
 * registered but silent: registering is done, so the register steps are dropped and the send step
 * leads, naming the registered schemas (B27). Otherwise every step.
 */
function stepsFor(
  requirement: SetupRequirement,
  result: SetupRequirementEnvironmentResult,
  environment: SetupEnvironmentHealth,
  backfill: SetupCustomerBackfillRecommendation | null,
): readonly SetupRecommendation[] {
  if (result.status === 'error') {
    return [SETUP_REJECTED_RECORDS_RECOMMENDATION, ...requirement.recommendations];
  }
  const rest = sendOrRegisterSteps(requirement, result, environment.environmentName);
  return requirement.id === 'customer_profiles' && backfill ? [...customerBackfillSteps(backfill, environment.environmentName), ...rest] : rest;
}

function sendOrRegisterSteps(requirement: SetupRequirement, result: SetupRequirementEnvironmentResult, environmentName: string): readonly SetupRecommendation[] {
  if (result.silentRegisteredSchemas.length === 0) {
    return requirement.recommendations;
  }
  const remaining = requirement.recommendations.filter((step) => !step.registersSchema);
  const send = remaining.find((step) => step.kind === 'api_endpoint');
  if (!send) {
    return remaining;
  }
  const names = result.silentRegisteredSchemas.map((name) => `"${name}"`).join(', ');
  const already = result.silentRegisteredSchemas.length === 1 ? 'is already registered' : 'are already registered';
  const lead: SetupRecommendation = { ...send, action: `${names} ${already}; nothing has arrived for it in ${environmentName} yet, so no registration is needed - send the records. ${send.action}` };
  return [lead, ...remaining.filter((step) => step !== send)];
}

/** `audit_installation_gaps`: every requirement not connected in the focus environment, with its cost and the steps to connect it. */
export function buildInstallationGapsOutput(report: SetupHealthReport, focus: SetupEnvironmentHealth, context: SetupOutputContext, coverage?: SetupCustomerCoverage | null) {
  const backfill = customerBackfillRecommendation(focus, coverage);
  const gaps = focus.requirements
    .filter((result) => result.status !== 'connected')
    .map((result) => {
      const requirement = getSetupRequirement(result.requirementId);
      const steps = stepsFor(requirement, result, focus, backfill);
      return {
        requirement_id: requirement.id,
        title: requirement.title,
        importance: requirement.importance,
        status: result.status,
        detail: describeSetupRequirementResult(result, focus.environmentName),
        impact_summary: requirement.impact,
        satisfied_by: requirement.satisfiedBy,
        schemas: schemasBehind(result),
        mapping: SETUP_SCHEMA_MAPPING,
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
      mapping: SETUP_SCHEMA_MAPPING,
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
    schema_mapping: SETUP_SCHEMA_MAPPING_NOTE,
    ...customerCoverageOutput(focus, context, coverage),
  };
}
