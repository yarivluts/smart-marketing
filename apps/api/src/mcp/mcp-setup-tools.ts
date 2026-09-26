/* eslint-disable @typescript-eslint/no-explicit-any -- every tool callback's args param is any, matching mcp-tools.ts (see toolInputSchema's doc comment there). */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  collectSetupObservations,
  DEFAULT_EVENT_VOLUME_WINDOW_DAYS,
  evaluateProjectSetupHealth,
  getEventVolumeOverviewForProject,
  listTrackingAlertsForProject,
  MAX_EVENT_VOLUME_RECORDS_PER_SCHEMA,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import {
  buildInstallationGapsOutput,
  buildSetupHealthOutput,
  ENVIRONMENTS,
  selectSetupFocusEnvironment,
  type SetupEnvironmentHealth,
  type SetupHealthReport,
  type SetupOutputContext,
} from '@growthos/shared';
import { apiBaseUrl, webAppUrl } from '../mcp-oauth/mcp-oauth-urls';
import { auditedToolHandler, errorResult, textResult, toolInputSchema, type ToolResult } from './mcp-tools';
import type { McpAuthContext } from './mcp-auth.guard';

/**
 * The integrator setup tools (KAN-197): is each data stream GrowthOS needs actually flowing, and if
 * not, what does that cost and how is it connected.
 *
 * Both are read tools behind the connection-level `mcp.read` gate, scoped to the credential's own
 * org/project like every other tool. Every status comes from `evaluateProjectSetupHealth`, which
 * reads the records each environment actually accepted and rejected; neither tool (nor anything
 * else) can mark a requirement verified. Every link in the output is built from the deployment's
 * own configured base URLs and resolves to a real page, endpoint or tool
 * (`setup-requirements-artifacts.spec.ts`).
 */

const environmentInputShape = {
  environment: z
    .enum(ENVIRONMENTS)
    .optional()
    .describe(
      'Which environment to report on: dev, staging or prod. Omit it to use the environment this API key is bound to (prod for an OAuth connection). An API key can only report on its own environment; a project-wide OAuth connection can name any. Each environment is judged only on the records it received itself.',
    ),
};

function outputContext(auth: McpAuthContext): SetupOutputContext {
  return {
    organizationId: auth.organizationId,
    projectId: auth.projectId,
    webAppUrl: webAppUrl(),
    apiBaseUrl: apiBaseUrl(),
    otherEnvironmentsVisible: auth.environmentId === undefined,
  };
}

/** The report and the one environment a call is about, or the error result explaining why there is none. */
async function resolveFocusEnvironment(
  auth: McpAuthContext,
  args: any,
): Promise<{ report: SetupHealthReport; focus: SetupEnvironmentHealth } | { error: ToolResult }> {
  const environmentName = (args as { environment?: string } | undefined)?.environment;
  let report: SetupHealthReport;
  try {
    // An API key is bound to one environment, and every read it makes stays inside it (KAN-28): it
    // is evaluated for that environment alone, so it can neither name another one nor see another
    // one's status in the summary. Only a project-wide OAuth connection reads every environment.
    report = await evaluateProjectSetupHealth({
      organizationId: auth.organizationId,
      projectId: auth.projectId,
      ...(auth.environmentId !== undefined ? { environmentId: auth.environmentId } : {}),
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return { error: errorResult('Project not found.') };
    }
    throw error;
  }
  if (auth.environmentId !== undefined && environmentName !== undefined) {
    const bound = report.environments.find((environment) => environment.environmentId === auth.environmentId);
    if (bound && bound.environmentName !== environmentName) {
      return {
        error: errorResult(
          `This API key is bound to the "${bound.environmentName}" environment and can only report on it. Use a key minted for "${environmentName}", or omit environment.`,
        ),
      };
    }
  }
  const focus = selectSetupFocusEnvironment(report, { environmentName, environmentId: auth.environmentId });
  if (!focus) {
    return {
      error: errorResult(
        environmentName === undefined ? 'This project has no environments provisioned, so there is nothing to report on.' : `This project has no "${environmentName}" environment.`,
      ),
    };
  }
  return { report, focus };
}

async function withFocusEnvironment(
  auth: McpAuthContext,
  args: any,
  render: (report: SetupHealthReport, focus: SetupEnvironmentHealth) => unknown,
): Promise<ToolResult> {
  const resolved = await resolveFocusEnvironment(auth, args);
  return 'error' in resolved ? resolved.error : textResult(render(resolved.report, resolved.focus));
}

const ingestHealthInputShape = {
  ...environmentInputShape,
  window_days: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe(`Days of daily accepted counts to return, ending today (UTC). Default ${DEFAULT_EVENT_VOLUME_WINDOW_DAYS}.`),
};

/**
 * KAN-202 I4: ingest health per event, per environment, over MCP - what an integrator could
 * previously only see in the web UI. The same reads the Ingest health and Schemas pages use, so
 * the numbers agree: accepted records per day and last seen per event schema, records still open
 * in quarantine with their reasons per schema (including names nobody registered), and whether a
 * tracking-broke alert is active.
 */
async function buildIngestHealth(auth: McpAuthContext, environmentId: string, environmentName: string, windowDays: number) {
  const [volume, observations, alerts] = await Promise.all([
    getEventVolumeOverviewForProject(auth.organizationId, auth.projectId, { environmentId, windowDays }),
    collectSetupObservations({ organizationId: auth.organizationId, projectId: auth.projectId, environmentId }),
    listTrackingAlertsForProject(auth.organizationId, auth.projectId, undefined, environmentId),
  ]);
  const activeAlerts = new Set(alerts.filter((alert) => alert.status === 'active').map((alert) => alert.schema_name));
  const quarantineFor = (kind: string, name: string) => observations.observations.find((observation) => observation.kind === kind && observation.schemaName === name);

  const events = volume.map((entry) => {
    const accepted = entry.dailyCounts.reduce((sum, bucket) => sum + bucket.count, 0);
    const quarantine = quarantineFor('event', entry.schemaName);
    return {
      event: entry.schemaName,
      accepted_in_window: accepted,
      // The read is capped per event; at the cap the true count may be higher.
      accepted_in_window_is_lower_bound: accepted >= MAX_EVENT_VOLUME_RECORDS_PER_SCHEMA,
      accepted_by_day: entry.dailyCounts,
      last_seen_at: entry.lastSeenAt,
      open_quarantined: quarantine?.openQuarantinedCount ?? 0,
      quarantine_reasons: quarantine?.quarantineReasons ?? [],
      tracking_alert_active: activeAlerts.has(entry.schemaName),
    };
  });
  const eventNames = new Set(events.map((event) => event.event));
  const otherSchemas = observations.observations
    .filter((observation) => !(observation.kind === 'event' && eventNames.has(observation.schemaName)))
    .map((observation) => ({
      kind: observation.kind,
      name: observation.schemaName,
      registered: observation.registered,
      last_accepted_at: observation.lastAcceptedAt,
      open_quarantined: observation.openQuarantinedCount,
      quarantine_reasons: observation.quarantineReasons,
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

  return {
    environment: environmentName,
    window_days: windowDays,
    events,
    other_schemas: otherSchemas,
    note: 'Counts are records that landed (accepted) in this environment, by UTC day; open_quarantined counts rejected records still awaiting action, from the newest ones. other_schemas lists entity and measure schemas, and names that were sent but never registered.',
  };
}

export function registerMcpSetupTools(server: McpServer, auth: McpAuthContext): void {
  server.registerTool(
    'get_ingest_health',
    {
      title: 'Get ingest health',
      description:
        "Ingest health per event in one environment: accepted records per UTC day over window_days and in total, last_seen_at, records still open in quarantine with their reasons, and whether a tracking-broke alert is active - plus entity/measure schemas and unregistered names in other_schemas. The same data as the Ingest health page. An API key reports only on its own environment; a project-wide OAuth connection can name one with environment (default prod).",
      inputSchema: toolInputSchema(ingestHealthInputShape),
    },
    auditedToolHandler(auth, 'get_ingest_health', async (args: any) => {
      const resolved = await resolveFocusEnvironment(auth, args);
      if ('error' in resolved) {
        return resolved.error;
      }
      const windowDays = (args as { window_days?: number } | undefined)?.window_days ?? DEFAULT_EVENT_VOLUME_WINDOW_DAYS;
      return textResult(await buildIngestHealth(auth, resolved.focus.environmentId, resolved.focus.environmentName, windowDays));
    }),
  );

  server.registerTool(
    'get_setup_health',
    {
      title: 'Get setup health',
      description:
        "How far this project's integration is connected: for each setup requirement (landing-page attribution, signups, product usage events, customer entity, billing, ad spend) whether it is connected (accepted records seen), an error (only rejected records, still in quarantine) or a gap (nothing received), in one environment in detail and every environment in summary. Statuses are derived from the ingest records each environment actually accepted or rejected; nothing can be marked connected by hand. Billing counts records from any billing system (a subscription_state_change event, or the Stripe connector). Use audit_installation_gaps for what each gap costs and how to connect it.",
      inputSchema: toolInputSchema(environmentInputShape),
    },
    auditedToolHandler(auth, 'get_setup_health', async (args: any) =>
      withFocusEnvironment(auth, args, (report, focus) => buildSetupHealthOutput(report, focus, outputContext(auth))),
    ),
  );

  server.registerTool(
    'audit_installation_gaps',
    {
      title: 'Audit installation gaps',
      description:
        "Every setup requirement not yet connected in one environment of this project, each with: why (what was or was not received there, including quarantine reasons for rejected records), impact_summary (which reports stay empty or wrong without it), satisfied_by (which records would connect it), connected_in_other_environments, and how_to_fix - concrete steps naming a real web page URL, ingest API endpoint or MCP tool. Also lists the requirements that are connected and the schemas that connected them. Read-only: it changes nothing.",
      inputSchema: toolInputSchema(environmentInputShape),
    },
    auditedToolHandler(auth, 'audit_installation_gaps', async (args: any) =>
      withFocusEnvironment(auth, args, (report, focus) => buildInstallationGapsOutput(report, focus, outputContext(auth))),
    ),
  );
}
