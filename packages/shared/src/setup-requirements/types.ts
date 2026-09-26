/**
 * Setup requirements (KAN-197): the data streams GrowthOS needs from an integration before its
 * reports mean anything, and whether each one is actually flowing.
 *
 * A requirement's status is DERIVED, never declared. It comes from the records a project's
 * environment has actually accepted (the landed raw records) and the ones it rejected (open
 * quarantine), per environment, so "connected" can only ever mean "accepted records were seen
 * here". An earlier, unmerged version kept a manually set `verified_requirements` list on the
 * project and a tool that ticked it; EasySign found that a ticked box and a working stream are
 * different things, so there is deliberately no field anywhere that can make a requirement read
 * as connected.
 */

/** The three ingest record kinds (mirrors `SchemaDefKind` in `@growthos/firebase-orm-models`, which this package cannot import). */
export type SetupRecordKind = 'event' | 'entity' | 'measure';

export const SETUP_REQUIREMENT_IDS = [
  'landing_page_attribution',
  'signups',
  'product_usage',
  'customer_profiles',
  'billing',
  'ad_spend',
] as const;
export type SetupRequirementId = (typeof SETUP_REQUIREMENT_IDS)[number];

export function isSetupRequirementId(value: string): value is SetupRequirementId {
  return (SETUP_REQUIREMENT_IDS as readonly string[]).includes(value);
}

/**
 * - `connected`: at least one accepted record for this requirement landed in the environment.
 * - `error`: nothing accepted, but records for it were rejected and are still in quarantine.
 * - `gap`: nothing seen at all, accepted or rejected.
 */
export const SETUP_REQUIREMENT_STATUSES = ['connected', 'error', 'gap'] as const;
export type SetupRequirementStatus = (typeof SETUP_REQUIREMENT_STATUSES)[number];

/** `core`: most reports are empty or wrong without it. `recommended`: one family of reports needs it. */
export type SetupRequirementImportance = 'core' | 'recommended';

/**
 * One concrete next step. Every artifact it points at is structured (not free text) so a test can
 * resolve it against the real code: a web page against the Next.js `apps/web/app` route tree, an
 * API endpoint against the Nest controllers, an MCP tool against the registered tool list. Paths
 * use `:orgId`/`:projectId` placeholders and never carry a host - the host is the deployment's own
 * configured base URL, filled in by whoever renders the step.
 */
export type SetupRecommendation =
  | { kind: 'web_page'; path: string; action: string }
  | { kind: 'api_endpoint'; method: 'GET' | 'POST'; path: string; action: string }
  | { kind: 'mcp_tool'; tool: string; action: string };

export interface SetupRequirement {
  id: SetupRequirementId;
  importance: SetupRequirementImportance;
  /** Plain English, returned as-is by the MCP tools. The web view uses its own translated copy. */
  title: string;
  /** What the reports lose while this requirement is not connected. */
  impact: string;
  /** Which records satisfy it, so a caller can see why a stream was or was not counted. */
  satisfiedBy: string;
  recommendations: readonly SetupRecommendation[];
}

/** One environment of the project (the `EnvironmentModel` id and its dev/staging/prod name). */
export interface SetupEnvironmentRef {
  id: string;
  name: string;
}

/**
 * What was observed for one schema (kind + name) in one environment. Produced by the
 * Firestore-backed collector in `@growthos/firebase-orm-models`; kept as plain data here so the
 * status logic is testable without a database.
 */
export interface SetupSchemaObservation {
  environmentId: string;
  kind: SetupRecordKind;
  schemaName: string;
  /** Registered in the project's schema registry (schemas are project-wide, not per environment). */
  registered: boolean;
  /** `landed_at` of the most recent accepted record in this environment, or null if none ever landed. */
  lastAcceptedAt: string | null;
  /** Records for this schema still open in this environment's quarantine (within the sampled window). */
  openQuarantinedCount: number;
  /** Distinct rejection reasons among those quarantined records. */
  quarantineReasons: readonly string[];
}

export interface SetupSchemaEvidence {
  kind: SetupRecordKind;
  name: string;
  lastAcceptedAt: string | null;
  openQuarantinedCount: number;
}

export interface SetupRequirementEnvironmentResult {
  requirementId: SetupRequirementId;
  status: SetupRequirementStatus;
  /** Schemas with accepted records in this environment, newest first. */
  acceptedSchemas: readonly SetupSchemaEvidence[];
  /** Schemas with open quarantined records in this environment. */
  rejectedSchemas: readonly SetupSchemaEvidence[];
  /** Registered schemas classified to this requirement that have no accepted record in this environment. */
  silentRegisteredSchemas: readonly string[];
  quarantineReasons: readonly string[];
  lastAcceptedAt: string | null;
}

export interface SetupEnvironmentHealth {
  environmentId: string;
  environmentName: string;
  requirements: readonly SetupRequirementEnvironmentResult[];
  connectedCount: number;
  totalCount: number;
  coreConnectedCount: number;
  coreTotalCount: number;
  /** connectedCount / totalCount, rounded, 0-100. */
  score: number;
}

export interface SetupHealthReport {
  environments: readonly SetupEnvironmentHealth[];
}
