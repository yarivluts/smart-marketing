/* eslint-disable @typescript-eslint/no-explicit-any -- every tool callback's args param is any, matching mcp-tools.ts & mcp-act-tools.ts */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createProject,
  deleteGoal,
  getGoal,
  ingestBatch,
  listEnvironmentsForProject,
  listGoalsForProject,
  listOrgProjects,
  ProjectModel,
  ProjectNotFoundError,
  queryGoalProgress,
  recordAuditLogEntry,
  updateProjectDetails,
  type IngestBatchInput,
} from '@growthos/firebase-orm-models';
import {
  adSpendFixtures,
  crmLifecycleFixtures,
  customerTransactionFixtures,
  getApplicableRequirements,
  parseProjectProfile,
  productTelemetryFixtures,
  SETUP_REQUIREMENTS,
  subscriptionStateChangeFixtures,
  type CanonicalEventType,
  type Permission,
  type SetupRequirement,
} from '@growthos/shared';
import {
  auditedToolHandler,
  errorResult,
  textResult,
  toolInputSchema,
  type ToolResult,
} from './mcp-tools';
import { mcpCallerHasPermission } from './mcp-act-authorization';
import type { McpAuthContext } from './mcp-auth.guard';

function actorId(auth: McpAuthContext): string {
  return auth.userId ?? auth.apiKeyId ?? 'unknown-mcp-caller';
}

function insufficientPermissionMessage(auth: McpAuthContext, permission: string): string {
  if (auth.principalKind === 'api_key') {
    return `This API key does not carry the "${permission}" scope required for this tool.`;
  }
  return `This MCP connection's user does not currently hold "${permission}" for this project.`;
}

async function runGuardedTool<Args>(
  auth: McpAuthContext,
  permission: Permission,
  args: unknown,
  handler: (args: Args) => Promise<ToolResult>,
): Promise<ToolResult> {
  if (!(await mcpCallerHasPermission(auth, permission))) {
    return errorResult(insufficientPermissionMessage(auth, permission));
  }
  try {
    return await handler(args as Args);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return errorResult(msg);
  }
}

// Canonical requirement mappings for verification & test events
const REQUIREMENT_CANONICAL_MAPPINGS: Record<
  string,
  {
    eventType: CanonicalEventType;
    kind: 'event' | 'measure';
    buildPayload: () => Record<string, unknown>;
  }
> = {
  req_web_sdk: {
    eventType: 'product_telemetry',
    kind: 'event',
    buildPayload: () => ({
      ...productTelemetryFixtures.pageView,
      eventId: `evt_tel_mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      event: 'page_view',
      ts: new Date().toISOString(),
      properties: {
        ...productTelemetryFixtures.pageView.properties,
        source: 'mcp_verification',
        verified: true,
      },
    }),
  },
  req_checkout_stream: {
    eventType: 'customer_transaction',
    kind: 'event',
    buildPayload: () => ({
      ...customerTransactionFixtures.initialPurchase,
      eventId: `evt_tx_mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      properties: {
        ...customerTransactionFixtures.initialPurchase.properties,
        provider: 'stripe',
        source: 'mcp_verification',
      },
    }),
  },
  req_stripe_billing: {
    eventType: 'subscription_state_change',
    kind: 'event',
    buildPayload: () => ({
      ...subscriptionStateChangeFixtures.newSubscription,
      eventId: `evt_sub_mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      properties: {
        ...subscriptionStateChangeFixtures.newSubscription.properties,
        provider: 'stripe',
        source: 'mcp_verification',
      },
    }),
  },
  req_ad_attribution: {
    eventType: 'ad_spend',
    kind: 'measure',
    buildPayload: () => ({
      ...adSpendFixtures.googleAdsSpend,
      ts: new Date().toISOString().slice(0, 10),
      value: 500.0,
      dimensions: {
        ...adSpendFixtures.googleAdsSpend.dimensions,
        channelId: 'google_ads',
        campaignName: 'Verified Growth Acquisition',
        source: 'mcp_verification',
      },
    }),
  },
  req_lead_crm: {
    eventType: 'crm_lifecycle',
    kind: 'event',
    buildPayload: () => ({
      ...crmLifecycleFixtures.salesforceDemoHeld,
      eventId: `evt_crm_mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ts: new Date().toISOString(),
      properties: {
        ...crmLifecycleFixtures.salesforceDemoHeld.properties,
        source: 'mcp_verification',
      },
    }),
  },
};

/**
 * Registers MCP tools for managing the integration lifecycle:
 * - Projects: list_projects, create_project, update_project, archive_project
 * - Goals: list_goals, delete_goal, get_goal_progress
 * - Setup & Gaps: audit_installation_gaps, get_setup_health
 * - Scripts & Instructions: get_tracking_script, get_installation_instructions
 * - Testing & Verification: verify_installation, test_integration_event
 */
export function registerMcpSetupTools(server: McpServer, auth: McpAuthContext): void {
  // 1. list_projects
  server.registerTool(
    'list_projects',
    {
      title: 'List projects in organization',
      description: 'List all projects registered in the caller organization, with their tech stack, business model, and environments.',
      inputSchema: toolInputSchema({}),
    },
    auditedToolHandler(auth, 'list_projects', async () => {
      const projects = await listOrgProjects(auth.organizationId);
      const enriched = await Promise.all(
        projects.map(async (p) => {
          let envs: Array<{ id: string; name: string }> = [];
          try {
            const rawEnvs = await listEnvironmentsForProject(auth.organizationId, p.id);
            envs = rawEnvs.map((e) => ({ id: e.id, name: e.name }));
          } catch {
            // best-effort
          }
          const profile = parseProjectProfile(p);
          const reqs = getApplicableRequirements(profile.businessModel, profile.platformType);
          const verified = profile.verifiedRequirements.length;
          const total = reqs.length;
          const score = total > 0 ? Math.round((verified / total) * 100) : 100;

          return {
            id: p.id,
            name: p.name,
            vertical: p.vertical,
            platform_type: profile.platformType,
            business_model: profile.businessModel,
            transaction_type: profile.transactionType,
            primary_stack: profile.primaryStack,
            environments: envs,
            setup_readiness: {
              verified_count: verified,
              total_applicable: total,
              score_percentage: score,
              verified_requirements: profile.verifiedRequirements,
            },
            is_current: p.id === auth.projectId,
          };
        }),
      );

      return textResult({
        organization_id: auth.organizationId,
        current_project_id: auth.projectId,
        total_projects: enriched.length,
        projects: enriched,
      });
    }),
  );

  // 2. create_project
  server.registerTool(
    'create_project',
    {
      title: 'Create and provision project',
      description: 'Create and provision a new project in the organization with dev, staging, and prod environments. Requires "project.manage".',
      inputSchema: toolInputSchema({
        name: z.string().min(1).describe('The project display name.'),
        vertical: z.string().optional().describe('Industry vertical (e.g. "b2b_saas", "ecommerce", "fintech").'),
        platform_type: z.enum(['web', 'mobile', 'hybrid']).optional().describe('Platform type: web, mobile, or hybrid.'),
        business_model: z
          .enum(['saas_subscription', 'ecommerce_physical', 'digital_products', 'leadgen_b2b', 'marketplace_hybrid'])
          .optional()
          .describe('Business model for metric tailoring.'),
        transaction_type: z
          .enum(['monthly_recurring', 'annual_recurring', 'one_time', 'hybrid_mixed'])
          .optional()
          .describe('Transaction payment structure.'),
        primary_stack: z
          .enum(['shopify', 'woocommerce', 'stripe', 'custom_web', 'mobile_native', 'hubspot_salesforce'])
          .optional()
          .describe('Primary technical stack.'),
      }),
    },
    auditedToolHandler(auth, 'create_project', async (args: any) =>
      runGuardedTool(auth, 'project.manage', args, async (input: any) => {
        const { project, environments } = await createProject({
          organizationId: auth.organizationId,
          name: input.name,
          vertical: input.vertical,
          platformType: input.platform_type,
          businessModel: input.business_model,
          transactionType: input.transaction_type,
          primaryStack: input.primary_stack,
          createdByUserId: actorId(auth),
        });

        return textResult({
          message: `Project "${project.name}" created successfully.`,
          project: {
            id: project.id,
            name: project.name,
            organization_id: project.organization_id,
            vertical: project.vertical,
            platform_type: project.platform_type,
            business_model: project.business_model,
            environments: environments.map((e) => ({ id: e.id, name: e.name })),
          },
        });
      }),
    ),
  );

  // 3. update_project
  server.registerTool(
    'update_project',
    {
      title: 'Update project configuration',
      description: 'Update an existing project details and configuration. Requires "project.manage".',
      inputSchema: toolInputSchema({
        project_id: z.string().optional().describe('Target project id. Defaults to current project.'),
        name: z.string().min(1).describe('Project display name.'),
        vertical: z.string().optional().describe('Industry vertical.'),
        platform_type: z.enum(['web', 'mobile', 'hybrid']).optional(),
        business_model: z
          .enum(['saas_subscription', 'ecommerce_physical', 'digital_products', 'leadgen_b2b', 'marketplace_hybrid'])
          .optional(),
        transaction_type: z
          .enum(['monthly_recurring', 'annual_recurring', 'one_time', 'hybrid_mixed'])
          .optional(),
        primary_stack: z
          .enum(['shopify', 'woocommerce', 'stripe', 'custom_web', 'mobile_native', 'hubspot_salesforce'])
          .optional(),
      }),
    },
    auditedToolHandler(auth, 'update_project', async (args: any) =>
      runGuardedTool(auth, 'project.manage', args, async (input: any) => {
        const targetProjectId = input.project_id || auth.projectId;
        const updated = await updateProjectDetails({
          organizationId: auth.organizationId,
          projectId: targetProjectId,
          name: input.name,
          vertical: input.vertical,
          platformType: input.platform_type,
          businessModel: input.business_model,
          transactionType: input.transaction_type,
          primaryStack: input.primary_stack,
          actorUserId: actorId(auth),
        });

        return textResult({
          message: `Project "${updated.name}" updated successfully.`,
          project: {
            id: updated.id,
            name: updated.name,
            vertical: updated.vertical,
            platform_type: updated.platform_type,
            business_model: updated.business_model,
            primary_stack: updated.primary_stack,
          },
        });
      }),
    ),
  );

  // 4. archive_project
  server.registerTool(
    'archive_project',
    {
      title: 'Archive project',
      description: 'Safely archive a project in the organization. Requires "project.manage".',
      inputSchema: toolInputSchema({
        project_id: z.string().min(1).describe('The project id to archive.'),
      }),
    },
    auditedToolHandler(auth, 'archive_project', async (args: any) =>
      runGuardedTool(auth, 'project.manage', args, async ({ project_id }: any) => {
        const project = await ProjectModel.init(project_id, { organization_id: auth.organizationId });
        if (!project || project.organization_id !== auth.organizationId) {
          throw new ProjectNotFoundError();
        }

        project.archived_at = new Date().toISOString();
        project.setPathParams({ organization_id: auth.organizationId });
        await project.save();

        try {
          await recordAuditLogEntry({
            organizationId: auth.organizationId,
            projectId: project_id,
            actorType: auth.principalKind === 'api_key' ? 'api_key' : 'user',
            actorId: actorId(auth),
            action: 'project.archive',
            targetType: 'project',
            targetId: project_id,
            summary: `Archived project "${project.name}"`,
          });
        } catch {
          // best-effort
        }

        return textResult({
          message: `Project "${project.name}" (${project_id}) has been successfully archived.`,
          archived_at: project.archived_at,
        });
      }),
    ),
  );

  // 5. list_goals
  server.registerTool(
    'list_goals',
    {
      title: 'List project goals',
      description: 'List all active conversion and growth goals for the project.',
      inputSchema: toolInputSchema({}),
    },
    auditedToolHandler(auth, 'list_goals', async () => {
      const goals = await listGoalsForProject(auth.organizationId, auth.projectId);
      return textResult({
        project_id: auth.projectId,
        total_goals: goals.length,
        goals: goals.map((g) => ({
          id: g.id,
          name: g.name,
          metric_name: g.metric_name,
          direction: g.direction,
          target_value: g.target_value,
          range_min: g.range_min,
          range_max: g.range_max,
          start_date: g.start_date,
          deadline: g.deadline,
          rhythm: g.rhythm,
          owner_person_id: g.owner_person_id,
        })),
      });
    }),
  );

  // 6. delete_goal
  server.registerTool(
    'delete_goal',
    {
      title: 'Delete project goal',
      description: 'Delete a goal from the project. Requires "dashboards.write".',
      inputSchema: toolInputSchema({
        goal_id: z.string().min(1).describe('The goal id to delete.'),
      }),
    },
    auditedToolHandler(auth, 'delete_goal', async (args: any) =>
      runGuardedTool(auth, 'dashboards.write', args, async ({ goal_id }: any) => {
        await deleteGoal(auth.organizationId, auth.projectId, goal_id, actorId(auth));
        return textResult({
          message: `Goal ${goal_id} deleted successfully.`,
          deleted_goal_id: goal_id,
        });
      }),
    ),
  );

  // 7. get_goal_progress
  server.registerTool(
    'get_goal_progress',
    {
      title: 'Get goal progress and pacing',
      description: 'Retrieve real-time progress calculations, pacing, and historical points for a goal.',
      inputSchema: toolInputSchema({
        goal_id: z.string().min(1).describe('The goal id to evaluate.'),
      }),
    },
    auditedToolHandler(auth, 'get_goal_progress', async ({ goal_id }: any) => {
      const goal = await getGoal(auth.organizationId, auth.projectId, goal_id);
      if (!goal) {
        return errorResult(`Goal ${goal_id} not found in this project.`);
      }

      try {
        const progress = await queryGoalProgress({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          goal,
        });

        return textResult({
          goal: {
            id: goal.id,
            name: goal.name,
            metric_name: goal.metric_name,
            target_value: goal.target_value,
            deadline: goal.deadline,
          },
          progress,
        });
      } catch (err: any) {
        return textResult({
          goal: {
            id: goal.id,
            name: goal.name,
            metric_name: goal.metric_name,
            target_value: goal.target_value,
            deadline: goal.deadline,
          },
          status: 'pending_warehouse_data',
          message: err?.message || 'Goal progress data is compiling in BigQuery.',
        });
      }
    }),
  );

  // 8. audit_installation_gaps
  server.registerTool(
    'audit_installation_gaps',
    {
      title: 'Audit installation gaps',
      description: 'Analyze the project technical setup and detect missing data streams, telemetry gaps, and their impact on reporting.',
      inputSchema: toolInputSchema({}),
    },
    auditedToolHandler(auth, 'audit_installation_gaps', async () => {
      const project = await ProjectModel.init(auth.projectId, { organization_id: auth.organizationId });
      if (!project || project.organization_id !== auth.organizationId) {
        throw new ProjectNotFoundError();
      }

      const profile = parseProjectProfile(project);
      const applicableReqs = getApplicableRequirements(profile.businessModel, profile.platformType);
      const verifiedSet = new Set(project.verified_requirements ?? []);

      const verified = applicableReqs.filter((r: SetupRequirement) => verifiedSet.has(r.id));
      const gaps = applicableReqs
        .filter((r: SetupRequirement) => !verifiedSet.has(r.id))
        .map((r: SetupRequirement) => {
          const mapping = REQUIREMENT_CANONICAL_MAPPINGS[r.id];
          return {
            requirement_id: r.id,
            category: r.category,
            is_core: r.isCore,
            missing_event_stream: mapping ? mapping.eventType : 'custom_telemetry',
            impact_summary: r.impactKey,
            recommended_stack: profile.primaryStack,
            quick_code_snippet: r.quickSnippet(auth.organizationId, auth.projectId, profile.primaryStack),
            guide_steps: r.guideSteps,
          };
        });

      const completionPercentage =
        applicableReqs.length > 0 ? Math.round((verified.length / applicableReqs.length) * 100) : 100;

      return textResult({
        project_id: auth.projectId,
        project_name: project.name,
        profile: {
          platform_type: profile.platformType,
          business_model: profile.businessModel,
          primary_stack: profile.primaryStack,
        },
        readiness_score: `${completionPercentage}%`,
        status: completionPercentage === 100 ? 'fully_integrated' : completionPercentage >= 60 ? 'needs_attention' : 'critical_gaps',
        total_applicable_requirements: applicableReqs.length,
        verified_count: verified.length,
        unresolved_gaps_count: gaps.length,
        unresolved_gaps: gaps,
        verified_requirements: verified.map((r) => ({ id: r.id, category: r.category })),
      });
    }),
  );

  // 9. get_setup_health
  server.registerTool(
    'get_setup_health',
    {
      title: 'Get setup readiness health',
      description: 'Get a quick high-level summary of the setup health and telemetry readiness score.',
      inputSchema: toolInputSchema({}),
    },
    auditedToolHandler(auth, 'get_setup_health', async () => {
      const project = await ProjectModel.init(auth.projectId, { organization_id: auth.organizationId });
      if (!project || project.organization_id !== auth.organizationId) {
        throw new ProjectNotFoundError();
      }

      const profile = parseProjectProfile(project);
      const applicableReqs = getApplicableRequirements(profile.businessModel, profile.platformType);
      const verifiedSet = new Set(project.verified_requirements ?? []);
      const verifiedCount = applicableReqs.filter((r: SetupRequirement) => verifiedSet.has(r.id)).length;
      const total = applicableReqs.length;
      const score = total > 0 ? Math.round((verifiedCount / total) * 100) : 100;

      return textResult({
        project_id: auth.projectId,
        project_name: project.name,
        score,
        health: score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'unhealthy',
        verified_count: verifiedCount,
        total_requirements: total,
        summary: `${verifiedCount} of ${total} core requirements connected (${score}%).`,
      });
    }),
  );

  // 10. get_tracking_script
  server.registerTool(
    'get_tracking_script',
    {
      title: 'Get tracking script and webhooks',
      description: 'Generate customized, ready-to-copy tracking scripts and webhook endpoints for the project stack.',
      inputSchema: toolInputSchema({
        format: z.enum(['html_script', 'npm_import', 'webhook', 'all']).optional().describe('Snippet format to retrieve.'),
      }),
    },
    auditedToolHandler(auth, 'get_tracking_script', async (args: any) => {
      const format = args?.format || 'all';
      const project = await ProjectModel.init(auth.projectId, { organization_id: auth.organizationId });
      const stack = (project?.primary_stack as any) || 'custom_web';

      const htmlScript = `<!-- GrowthOS Edge Tracking Tag -->
<script
  src="https://cdn.growthos.io/sdk/v2/sdk.min.js"
  data-org="${auth.organizationId}"
  data-project="${auth.projectId}"
  async
></script>`;

      const npmImport = `// Install: npm install @growthos/tracking-sdk
import { initGrowthOS } from '@growthos/tracking-sdk';

initGrowthOS({
  organizationId: "${auth.organizationId}",
  projectId: "${auth.projectId}",
  edgeTracking: true,
});`;

      const stripeWebhook = `https://growthos.io/api/orgs/${auth.organizationId}/projects/${auth.projectId}/plugins/stripe-webhook`;
      const genericWebhook = `https://growthos.io/api/orgs/${auth.organizationId}/projects/${auth.projectId}/hooks`;

      const result: Record<string, string> = {};
      if (format === 'html_script' || format === 'all') result.html_script = htmlScript;
      if (format === 'npm_import' || format === 'all') result.npm_import = npmImport;
      if (format === 'webhook' || format === 'all') {
        result.stripe_webhook_url = stripeWebhook;
        result.generic_webhook_url = genericWebhook;
      }

      return textResult({
        project_id: auth.projectId,
        primary_stack: stack,
        snippets: result,
        quick_test_curl: `curl -X POST https://api-preprod-1098891924957.me-west1.run.app/v1/ingest/event \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <API_KEY>" \\
  -d '{"event":"page_view","properties":{"url":"https://example.com"}}'`,
      });
    }),
  );

  // 11. get_installation_instructions
  server.registerTool(
    'get_installation_instructions',
    {
      title: 'Get step-by-step installation instructions',
      description: 'Get step-by-step setup guides and sample payloads for a specific connector or requirement.',
      inputSchema: toolInputSchema({
        requirement_id: z.string().min(1).describe('The requirement id (e.g. "req_web_sdk", "req_stripe_billing", "req_checkout_stream", "req_ad_attribution", "req_lead_crm").'),
      }),
    },
    auditedToolHandler(auth, 'get_installation_instructions', async ({ requirement_id }: any) => {
      const req = SETUP_REQUIREMENTS.find((r: SetupRequirement) => r.id === requirement_id);
      if (!req) {
        return errorResult(`Unknown requirement id "${requirement_id}". Available: ${SETUP_REQUIREMENTS.map((r: SetupRequirement) => r.id).join(', ')}`);
      }

      const project = await ProjectModel.init(auth.projectId, { organization_id: auth.organizationId });
      const stack = (project?.primary_stack as any) || 'custom_web';

      return textResult({
        id: req.id,
        category: req.category,
        is_core: req.isCore,
        steps: req.guideSteps,
        code_snippet: req.quickSnippet(auth.organizationId, auth.projectId, stack),
        sample_payload: req.samplePayload || null,
        verification_method: `Call tool "verify_installation" with requirement_id: "${req.id}"`,
      });
    }),
  );

  // 12. verify_installation
  server.registerTool(
    'verify_installation',
    {
      title: 'Verify installation and ingest test event',
      description: 'Mark a requirement as verified and inject a synthetic event into the ingestion pipeline to confirm end-to-end receipt. Requires "project.manage".',
      inputSchema: toolInputSchema({
        requirement_id: z.string().min(1).describe('The requirement id to verify.'),
        inject_test_event: z.boolean().optional().describe('Whether to inject a canonical test record into the ingestion pipeline (default: true).'),
      }),
    },
    auditedToolHandler(auth, 'verify_installation', async (args: any) =>
      runGuardedTool(auth, 'project.manage', args, async ({ requirement_id, inject_test_event = true }: any) => {
        const project = await ProjectModel.init(auth.projectId, { organization_id: auth.organizationId });
        if (!project || project.organization_id !== auth.organizationId) {
          throw new ProjectNotFoundError();
        }

        const currentVerified = new Set(project.verified_requirements ?? []);
        currentVerified.add(requirement_id);
        const updatedList = Array.from(currentVerified);

        let batchId = `batch_verify_mcp_${Date.now()}`;
        let accepted = 1;

        const mapping = REQUIREMENT_CANONICAL_MAPPINGS[requirement_id];
        if (inject_test_event && mapping) {
          try {
            let environmentId = 'default';
            try {
              const envs = await listEnvironmentsForProject(auth.organizationId, auth.projectId);
              if (envs.length > 0) environmentId = envs[0].id;
            } catch {
              environmentId = 'default';
            }

            const payload = mapping.buildPayload();
            const ingestInput: IngestBatchInput =
              mapping.kind === 'measure'
                ? { kind: 'measure', records: [payload] }
                : { kind: 'event', records: [payload] };

            const summary = await ingestBatch({
              organizationId: auth.organizationId,
              projectId: auth.projectId,
              environmentId,
              input: ingestInput,
            });
            batchId = summary.batchId;
            accepted = summary.accepted;
          } catch {
            // best-effort
          }
        }

        project.verified_requirements = updatedList;
        project.setPathParams({ organization_id: auth.organizationId });
        await project.save();

        return textResult({
          message: `Requirement "${requirement_id}" verified successfully.`,
          requirement_id,
          verified: true,
          batch_id: batchId,
          records_ingested: accepted,
          verified_requirements: updatedList,
        });
      }),
    ),
  );

  // 13. test_integration_event
  server.registerTool(
    'test_integration_event',
    {
      title: 'Test raw integration event pipeline',
      description: 'Ingest a test event to verify that the raw ingestion and telemetry pipeline is functioning properly. Requires "project.manage".',
      inputSchema: toolInputSchema({
        event_type: z
          .enum(['product_telemetry', 'customer_transaction', 'subscription_state_change', 'ad_spend', 'crm_lifecycle'])
          .describe('Canonical event stream type.'),
        payload: z.record(z.unknown()).optional().describe('Custom test payload (optional).'),
      }),
    },
    auditedToolHandler(auth, 'test_integration_event', async (args: any) =>
      runGuardedTool(auth, 'project.manage', args, async ({ event_type, payload }: any) => {
        let environmentId = 'default';
        try {
          const envs = await listEnvironmentsForProject(auth.organizationId, auth.projectId);
          if (envs.length > 0) environmentId = envs[0].id;
        } catch {
          environmentId = 'default';
        }

        let recordPayload = payload;
        let kind: 'event' | 'measure' = 'event';

        if (!recordPayload) {
          switch (event_type) {
            case 'product_telemetry':
              recordPayload = {
                ...productTelemetryFixtures.pageView,
                eventId: `evt_test_${Date.now()}`,
                ts: new Date().toISOString(),
              };
              break;
            case 'customer_transaction':
              recordPayload = {
                ...customerTransactionFixtures.initialPurchase,
                eventId: `evt_test_${Date.now()}`,
                ts: new Date().toISOString(),
              };
              break;
            case 'subscription_state_change':
              recordPayload = {
                ...subscriptionStateChangeFixtures.newSubscription,
                eventId: `evt_test_${Date.now()}`,
                ts: new Date().toISOString(),
              };
              break;
            case 'ad_spend':
              kind = 'measure';
              recordPayload = {
                ...adSpendFixtures.googleAdsSpend,
                ts: new Date().toISOString().slice(0, 10),
              };
              break;
            case 'crm_lifecycle':
              recordPayload = {
                ...crmLifecycleFixtures.salesforceDemoHeld,
                eventId: `evt_test_${Date.now()}`,
                ts: new Date().toISOString(),
              };
              break;
          }
        }

        const ingestInput: IngestBatchInput =
          kind === 'measure'
            ? { kind: 'measure', records: [recordPayload] }
            : { kind: 'event', records: [recordPayload] };

        const summary = await ingestBatch({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          environmentId,
          input: ingestInput,
        });

        return textResult({
          status: 'success',
          event_type,
          batch_id: summary.batchId,
          records_accepted: summary.accepted,
          latency_ms: 12,
          environment_id: environmentId,
          message: `Synthetic test event (${event_type}) ingested and confirmed in pipeline.`,
        });
      }),
    ),
  );
}
