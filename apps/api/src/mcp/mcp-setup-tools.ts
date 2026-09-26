/* eslint-disable @typescript-eslint/no-explicit-any -- every tool callback's args param is any, matching mcp-tools.ts (see toolInputSchema's doc comment there). */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { evaluateProjectSetupHealth, ProjectNotFoundError } from '@growthos/firebase-orm-models';
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

async function withFocusEnvironment(
  auth: McpAuthContext,
  args: any,
  render: (report: SetupHealthReport, focus: SetupEnvironmentHealth) => unknown,
): Promise<ToolResult> {
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
      return errorResult('Project not found.');
    }
    throw error;
  }
  if (auth.environmentId !== undefined && environmentName !== undefined) {
    const bound = report.environments.find((environment) => environment.environmentId === auth.environmentId);
    if (bound && bound.environmentName !== environmentName) {
      return errorResult(
        `This API key is bound to the "${bound.environmentName}" environment and can only report on it. Use a key minted for "${environmentName}", or omit environment.`,
      );
    }
  }
  const focus = selectSetupFocusEnvironment(report, { environmentName, environmentId: auth.environmentId });
  if (!focus) {
    return errorResult(
      environmentName === undefined ? 'This project has no environments provisioned, so there is nothing to report on.' : `This project has no "${environmentName}" environment.`,
    );
  }
  return textResult(render(report, focus));
}

export function registerMcpSetupTools(server: McpServer, auth: McpAuthContext): void {
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
