import { TOUCHPOINT_SCHEMA_NAME } from '../touchpoint-capture/touchpoint-schema';
import type { SetupRecommendation, SetupRequirement, SetupRequirementId } from './types';

/**
 * The requirement catalog. Every requirement applies to every project: there is no per-project
 * switch to turn one off (and so nothing a human manages), which keeps the status an honest
 * reading of the data rather than of a configuration. A project that genuinely has no billing
 * simply reads a billing gap, and the text says what that costs.
 *
 * Recommendations only name artifacts that exist in this repository - see
 * `setup-requirements-artifacts.spec.ts` in apps/api, which resolves every one of them against the
 * web route tree, the API controllers and the registered MCP tools, and fails on anything else
 * (the unmerged predecessor recommended an npm package, a CDN script and a webhook host that
 * never existed).
 */

const REGISTER_SCHEMA_TOOL = 'register_schema';
const EVENTS_ENDPOINT = '/v1/ingest/events';

export const SETUP_REQUIREMENTS: readonly SetupRequirement[] = [
  {
    id: 'landing_page_attribution',
    importance: 'core',
    title: 'Landing-page attribution (touchpoints)',
    impact:
      'Without touchpoints no signup or customer can be traced back to the campaign, channel or landing page that brought it, so landing-page performance and channel attribution stay empty.',
    satisfiedBy: `Accepted "${TOUCHPOINT_SCHEMA_NAME}" events.`,
    recommendations: [
      {
        kind: 'web_page',
        registersSchema: true,
        path: '/orgs/:orgId/projects/:projectId/schema-defs',
        action: `Register the built-in "${TOUCHPOINT_SCHEMA_NAME}" event schema (the Schema Registry page has a button for it).`,
      },
      {
        kind: 'web_page',
        path: '/orgs/:orgId/projects/:projectId/keys',
        action:
          'Mint an API key for this environment whose only scope is ingest.write. The Keys page then shows the tracking snippet to paste into the <head> of every landing page: it records a touchpoint with the UTM parameters and click ids of each visit.',
      },
      {
        kind: 'api_endpoint',
        method: 'POST',
        path: EVENTS_ENDPOINT,
        action: `Or send "${TOUCHPOINT_SCHEMA_NAME}" events from your own code, with properties such as utm_source, utm_medium, utm_campaign, landing_page, referrer, click_id and channel, and the visitor's anon_id on the envelope.`,
      },
    ],
  },
  {
    id: 'signups',
    importance: 'core',
    title: 'Signups',
    impact:
      'Without a signup event there is no conversion to attribute: the funnel has no entry step, and cost per signup, landing-page conversion rate and cohorts cannot be computed.',
    satisfiedBy: 'Accepted events whose name says signup or registration (for example "signup", "user_signed_up", "account_created").',
    recommendations: [
      {
        kind: 'mcp_tool',
        registersSchema: true,
        tool: REGISTER_SCHEMA_TOOL,
        action: 'Register an event schema for your signup event, for example "signup" (use dry_run first).',
      },
      {
        kind: 'api_endpoint',
        method: 'POST',
        path: EVENTS_ENDPOINT,
        action: "Send one event per new account, with customer_id set and the visitor's anon_id carried over, so the signup links back to the touchpoint that brought it.",
      },
    ],
  },
  {
    id: 'product_usage',
    importance: 'core',
    title: 'Product usage events',
    impact: 'Without product events there is no activation, engagement or retention reading: cohorts and the funnel stop at signup.',
    satisfiedBy: 'Accepted events that are not touchpoints, signups or billing events (for example "document_created").',
    recommendations: [
      {
        kind: 'mcp_tool',
        registersSchema: true,
        tool: REGISTER_SCHEMA_TOOL,
        action: 'Register an event schema for each core product action (for example "document_created", "project_shared").',
      },
      {
        kind: 'api_endpoint',
        method: 'POST',
        path: EVENTS_ENDPOINT,
        action: 'Send one event each time a customer performs that action, with customer_id set.',
      },
    ],
  },
  {
    id: 'customer_profiles',
    importance: 'core',
    title: 'Customer entity',
    impact: 'Without customer entities Customer 360 and search_customers have no rows, and segments cannot filter on plan, status or other customer attributes.',
    satisfiedBy: 'Accepted entity records other than billing entities (for example a "customer" entity).',
    recommendations: [
      {
        kind: 'mcp_tool',
        registersSchema: true,
        tool: REGISTER_SCHEMA_TOOL,
        action: 'Register an entity schema, for example "customer", with the attributes you want to segment on (plan, status, created_at).',
      },
      {
        kind: 'api_endpoint',
        method: 'POST',
        path: '/v1/ingest/entities',
        action: 'Upsert one entity per customer and send it again whenever an attribute changes; the latest version wins.',
      },
    ],
  },
  {
    id: 'billing',
    importance: 'core',
    title: 'Billing and subscriptions',
    impact: 'Without billing records there is no revenue, MRR, churn or payback reading, and no report can say which channel brings paying customers.',
    satisfiedBy:
      'Accepted subscription, invoice, payment, charge or refund records from any billing system: a "subscription_state_change" event, or the Stripe connector\'s stripe_charge / stripe_invoice / stripe_subscription records.',
    recommendations: [
      {
        kind: 'mcp_tool',
        registersSchema: true,
        tool: REGISTER_SCHEMA_TOOL,
        action:
          'For any billing system (Stripe is not required), register a "subscription_state_change" event schema, for example with properties plan, previous_plan, status, mrr and currency.',
      },
      {
        kind: 'api_endpoint',
        method: 'POST',
        path: EVENTS_ENDPOINT,
        action: 'Send one "subscription_state_change" event per plan change, with customer_id, mrr (the monthly recurring amount after the change), currency and, optionally, status (mrr 0 reads as canceled). Movements - new, upgrade, downgrade, cancel, reactivation - are derived from consecutive changes, so the source does not classify them.',
      },
      {
        kind: 'web_page',
        path: '/orgs/:orgId/projects/:projectId/plugins',
        action: 'If you bill through Stripe, install the Stripe connector on the Plugins page instead; it lands charges, invoices, refunds and subscriptions.',
      },
    ],
  },
  {
    id: 'ad_spend',
    importance: 'recommended',
    title: 'Ad spend',
    impact: 'Without ad spend there is no cost side: CAC, cost per signup, ROAS and payback cannot be computed, even when attribution works.',
    satisfiedBy: 'Accepted "ad_spend" measures (or another measure whose name says spend).',
    recommendations: [
      {
        kind: 'web_page',
        registersSchema: true,
        path: '/orgs/:orgId/projects/:projectId/plugins',
        action: 'Install the SaaS marketing metric pack on the Plugins page; it registers the "ad_spend" measure schema and the metrics that read it.',
      },
      {
        kind: 'mcp_tool',
        registersSchema: true,
        tool: REGISTER_SCHEMA_TOOL,
        action: 'Or register the "ad_spend" measure schema yourself, with dimensions channel_id, campaign_id, adset_id and ad_id.',
      },
      {
        kind: 'api_endpoint',
        method: 'POST',
        path: '/v1/ingest/measures',
        action: 'Send one "ad_spend" measure per channel and campaign per day: value is the amount spent, ts is the day.',
      },
    ],
  },
];

/** Added to a requirement's steps when its records are being rejected: the fix starts with the rejection reasons. */
export const SETUP_REJECTED_RECORDS_RECOMMENDATION: SetupRecommendation = {
  kind: 'web_page',
  path: '/orgs/:orgId/projects/:projectId/ingest-health',
  action: "Open Ingest health for this environment to read each rejected record's reasons, fix the schema (evolve_schema) or the payload, then replay the record.",
};

export function getSetupRequirement(id: SetupRequirementId): SetupRequirement {
  const requirement = SETUP_REQUIREMENTS.find((candidate) => candidate.id === id);
  if (!requirement) {
    throw new Error(`Unknown setup requirement: ${id}`);
  }
  return requirement;
}

/** Every recommendation the tools can return, for the artifact-existence test. */
export function allSetupRecommendations(): SetupRecommendation[] {
  return [...SETUP_REQUIREMENTS.flatMap((requirement) => requirement.recommendations), SETUP_REJECTED_RECORDS_RECOMMENDATION];
}
