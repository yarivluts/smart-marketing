/* eslint-disable @typescript-eslint/no-explicit-any -- same TypeScript-compiler-limit reason `mcp-tools.ts`'s own top-of-file comment documents: every tool callback's `args` param is `any`, narrowed/validated by hand inside each handler. */
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  approveAutomationAction,
  AutomationActionInvalidStateError,
  AutomationActionNotFoundError,
  AutomationKillSwitchEngagedError,
  AutomationTargetNotFoundError,
  createGoal,
  createSegment,
  InsufficientWriteTierError,
  InvalidAutomationActionError,
  InvalidGoalError,
  InvalidSegmentError,
  ProjectNotFoundError,
  proposeAutomationBudgetChangeAction,
} from '@growthos/firebase-orm-models';
import type { Permission } from '@growthos/shared';
import { auditedToolHandler, errorResult, textResult, toolInputSchema, type ToolResult } from './mcp-tools';
import { mcpCallerHasPermission } from './mcp-act-authorization';
import type { McpAuthContext } from './mcp-auth.guard';

/**
 * Registers KAN-76's act-tool surface (plan `13 §22.2`) on the same
 * {@link McpServer}/{@link McpAuthContext} `registerMcpTools` (`mcp-tools.ts`)
 * registers KAN-75's read tools on — see `mcp.controller.ts` for why both are
 * called against one fresh per-request server instance.
 *
 * Every tool here calls the exact same `packages/firebase-orm-models`
 * service function the equivalent `apps/web` route already calls
 * (`proposeAutomationBudgetChangeAction`/`approveAutomationAction`/
 * `createGoal`/`createSegment`) — no parallel mutation path, no duplicated
 * business logic, audit logging included for free since it happens inside
 * those service functions themselves.
 *
 * Unlike the read tools (gated once, at connection time, on `mcp.read`
 * alone), each act tool additionally requires its own specific permission —
 * `automation.execute`/`automation.approve` mirroring the web app's own
 * `automation/actions` routes exactly, `dashboards.write` mirroring the
 * `goals` route (KAN-76's own reasoning: `mcp.act` is deliberately *not*
 * introduced as one blanket new permission — see this module's own PR
 * description for why per-tool reuse of an already-modeled permission is a
 * better fit than a new, coarser one). `mcpCallerHasPermission` checks this
 * fresh on every call — see its own doc comment for the api_key-vs-oauth
 * split.
 */

function describeActToolError(error: unknown): string {
  if (error instanceof ProjectNotFoundError || error instanceof AutomationTargetNotFoundError || error instanceof AutomationActionNotFoundError) {
    return 'Not found.';
  }
  if (
    error instanceof InvalidAutomationActionError ||
    error instanceof AutomationActionInvalidStateError ||
    error instanceof AutomationKillSwitchEngagedError ||
    error instanceof InsufficientWriteTierError
  ) {
    return error.message;
  }
  if (error instanceof InvalidGoalError || error instanceof InvalidSegmentError) {
    return `Invalid: ${error.reasons.join('; ')}`;
  }
  throw error;
}

function insufficientPermissionMessage(auth: McpAuthContext, permission: string): string {
  if (auth.principalKind === 'api_key') {
    return `This API key does not carry the "${permission}" scope required for this tool.`;
  }
  return `This MCP connection's user does not currently hold "${permission}" for this project.`;
}

/** The audit-trail actor id to attribute an act-tool mutation to: the granting human for an OAuth connection, or the key's own id for an API-key one (a key has no user id of its own) — see `McpAuthContext.apiKeyId`'s own doc comment. */
function actorId(auth: McpAuthContext): string {
  return auth.userId ?? auth.apiKeyId ?? 'unknown-mcp-caller';
}

/** The audit-trail actor *type* to record alongside {@link actorId} — `createGoal`/`createSegment` write this straight onto their `recordAuditLogEntry` call, so an API-key-driven mutation is never mislabeled as a real human user in the audit log. */
function actorType(auth: McpAuthContext): 'user' | 'api_key' {
  return auth.principalKind === 'api_key' ? 'api_key' : 'user';
}

/**
 * Shared body for every act tool: check `permission` fresh, then run
 * `handler` and map any thrown error through {@link describeActToolError} —
 * the same "auth check once, real work in a handler" factoring
 * `runMetricQueryTool` (`mcp-tools.ts`) already established for the read
 * tools, applied here to a per-tool permission instead of one shared
 * `mcp.read` gate.
 */
async function runActTool<Args>(
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
    return errorResult(describeActToolError(error));
  }
}

const proposeActionInputShape = {
  target_id: z.string().min(1).describe('The seeded automation target id (see the project automation page).'),
  after_daily_budget_usd: z.number().describe('The proposed new daily budget, in USD.'),
};

const approveActionInputShape = {
  action_id: z.string().min(1).describe('The automation action id returned by propose_action, currently "awaiting_approval".'),
};

const createGoalInputShape = {
  name: z.string().min(1),
  metric_name: z.string().min(1).describe('Must be a currently registered and active metric (see list_metrics).'),
  direction: z.string().describe('One of: maximize, minimize, range.'),
  target_value: z.number().optional().describe('Required for maximize/minimize.'),
  range_min: z.number().optional().describe('Required for range, together with range_max.'),
  range_max: z.number().optional(),
  start_date: z.string().min(1).describe('YYYY-MM-DD, inclusive.'),
  deadline: z.string().min(1).describe('YYYY-MM-DD, inclusive, must be after start_date.'),
  rhythm: z.string().describe('One of: even, work_week_weekend.'),
  owner_person_id: z.string().min(1).describe('An id from the org people registry.'),
};

const createSegmentInputShape = {
  name: z.string().min(1),
  schema_name: z.string().min(1).describe('A registered and active entity schema name, e.g. "customer".'),
  filters: z.unknown().describe('Array of { field, op, value } — op is one of =, !=, >, >=, <, <=, contains. ANDed together.'),
};

export function registerMcpActTools(server: McpServer, auth: McpAuthContext): void {
  server.registerTool(
    'propose_action',
    {
      title: 'Propose action (dry-run diff)',
      description:
        'Propose a simulated ad-campaign budget change for a seeded automation target — evaluates every guardrail and lands as "blocked" or "awaiting_approval", never executes anything by itself. Requires "automation.execute".',
      inputSchema: toolInputSchema(proposeActionInputShape),
    },
    auditedToolHandler(auth, 'propose_action', async (args: any) =>
      runActTool(auth, 'automation.execute', args, async (a: { target_id: string; after_daily_budget_usd: number }) => {
        const action = await proposeAutomationBudgetChangeAction({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          targetId: a.target_id,
          afterDailyBudgetUsd: a.after_daily_budget_usd,
          requestedByUserId: actorId(auth),
        });
        return textResult({ id: action.id, status: action.status, guardrailViolations: action.guardrail_violations });
      }),
    ),
  );

  server.registerTool(
    'approve_action',
    {
      title: 'Approve action',
      description: 'Approve an "awaiting_approval" automation action so it can be executed. Requires "automation.approve", distinct from "automation.execute".',
      inputSchema: toolInputSchema(approveActionInputShape),
    },
    auditedToolHandler(auth, 'approve_action', async (args: any) =>
      runActTool(auth, 'automation.approve', args, async (a: { action_id: string }) => {
        const action = await approveAutomationAction({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          actionId: a.action_id,
          approverId: actorId(auth),
        });
        return textResult({ id: action.id, status: action.status });
      }),
    ),
  );

  server.registerTool(
    'create_goal',
    {
      title: 'Create goal',
      description:
        'Create a goal pinning a registered metric to a target (or range) and a deadline, with an owner and calendar rhythm. Requires "dashboards.write".',
      inputSchema: toolInputSchema(createGoalInputShape),
    },
    auditedToolHandler(auth, 'create_goal', async (args: any) =>
      runActTool(
        auth,
        'dashboards.write',
        args,
        async (a: {
          name: string;
          metric_name: string;
          direction: string;
          target_value?: number;
          range_min?: number;
          range_max?: number;
          start_date: string;
          deadline: string;
          rhythm: string;
          owner_person_id: string;
        }) => {
          const goal = await createGoal({
            organizationId: auth.organizationId,
            projectId: auth.projectId,
            name: a.name,
            metricName: a.metric_name,
            direction: a.direction,
            ...(a.target_value !== undefined ? { targetValue: a.target_value } : {}),
            ...(a.range_min !== undefined ? { rangeMin: a.range_min } : {}),
            ...(a.range_max !== undefined ? { rangeMax: a.range_max } : {}),
            startDate: a.start_date,
            deadline: a.deadline,
            rhythm: a.rhythm,
            ownerPersonId: a.owner_person_id,
            createdByUserId: actorId(auth),
            createdByActorType: actorType(auth),
          });
          return textResult({
            id: goal.id,
            name: goal.name,
            metricName: goal.metric_name,
            direction: goal.direction,
            deadline: goal.deadline,
          });
        },
      ),
    ),
  );

  server.registerTool(
    'create_segment',
    {
      title: 'Create segment',
      description:
        'Save a named customer segment definition — an ANDed set of filter conditions over one registered entity schema (e.g. "paying, no demo, MRR > $200"). A definition only: no live member list is materialized yet. Requires "dashboards.write".',
      inputSchema: toolInputSchema(createSegmentInputShape),
    },
    auditedToolHandler(auth, 'create_segment', async (args: any) =>
      runActTool(auth, 'dashboards.write', args, async (a: { name: string; schema_name: string; filters: unknown }) => {
        if (!Array.isArray(a.filters)) {
          return errorResult('"filters" must be an array of { field, op, value } conditions.');
        }
        const segment = await createSegment({
          organizationId: auth.organizationId,
          projectId: auth.projectId,
          name: a.name,
          schemaName: a.schema_name,
          filters: a.filters,
          createdByUserId: actorId(auth),
          createdByActorType: actorType(auth),
        });
        return textResult({ id: segment.id, name: segment.name, schemaName: segment.schema_name, filters: segment.filters });
      }),
    ),
  );
}
