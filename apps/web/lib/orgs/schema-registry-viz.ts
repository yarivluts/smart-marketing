import {
  classifySchemaForSetupRequirement,
  SETUP_REQUIREMENT_IDS,
  type SetupEnvironmentHealth,
  type SetupRecordKind,
  type SetupRequirementId,
  type SetupRequirementStatus,
} from '@growthos/shared';

/**
 * Chart and diagram shaping for the Schema Registry page. Pure functions over data the page already
 * loads (the registered schemas, the event-volume overview and the setup-health derivation), so every
 * number on the page can be traced to a record and tested without Firestore.
 */

export interface SchemaFamilyRef {
  kind: string;
  name: string;
}

export interface EventVolumeEntryRef {
  schemaName: string;
  dailyCounts: readonly { date: string; count: number }[];
  lastSeenAt: string | null;
}

export type SchemaKindCounts = Record<SetupRecordKind, number>;

export function countFamiliesByKind(families: readonly SchemaFamilyRef[]): SchemaKindCounts {
  const counts: SchemaKindCounts = { event: 0, entity: 0, measure: 0 };
  for (const family of families) {
    if (family.kind === 'event' || family.kind === 'entity' || family.kind === 'measure') {
      counts[family.kind] += 1;
    }
  }
  return counts;
}

export function totalEvents(entry: EventVolumeEntryRef): number {
  return entry.dailyCounts.reduce((sum, bucket) => sum + bucket.count, 0);
}

/**
 * Where one event schema stands on receiving records, matching how tracking alerts actually work:
 * an alert only fires for a schema that HAS landed records and then went silent, so a schema that
 * never landed one is `not_connected` (no alert, by design) - or `only_rejected` when records are
 * arriving but every one is quarantined. Never call either "silent": that word promises an alert.
 */
export type EventReceiptState = 'receiving' | 'not_connected' | 'only_rejected';

export function eventReceiptState(entry: Pick<EventVolumeEntryRef, 'lastSeenAt'>, rejectedCount: number): EventReceiptState {
  if (entry.lastSeenAt !== null) return 'receiving';
  return rejectedCount > 0 ? 'only_rejected' : 'not_connected';
}

/** Event schemas that never landed a record - the ones tracking alerts deliberately do not cover. */
export function countNeverReceived(entries: readonly Pick<EventVolumeEntryRef, 'lastSeenAt'>[]): number {
  return entries.filter((entry) => entry.lastSeenAt === null).length;
}

/** The per-day sum across every event schema - the window's overall volume line. */
export function dailyVolumeTotals(entries: readonly EventVolumeEntryRef[]): { date: string; count: number }[] {
  const byDate = new Map<string, number>();
  for (const entry of entries) {
    for (const bucket of entry.dailyCounts) {
      byDate.set(bucket.date, (byDate.get(bucket.date) ?? 0) + bucket.count);
    }
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

export interface StackedVolumeChart {
  /** One row per day: `date` plus one numeric column per series key. */
  rows: Record<string, string | number>[];
  series: { key: string; label: string }[];
}

/**
 * Daily volume stacked by schema: the `topN` busiest schemas get their own series and the rest are
 * folded into one "other" series (labelled by the caller, so the copy stays in translations). A
 * schema with no events in the window gets no series at all.
 */
export function stackedVolumeChart(entries: readonly EventVolumeEntryRef[], topN: number, otherLabel: string, formatDate: (date: string) => string = (date) => date): StackedVolumeChart {
  const ranked = entries
    .map((entry) => ({ entry, total: totalEvents(entry) }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total || a.entry.schemaName.localeCompare(b.entry.schemaName));
  const top = ranked.slice(0, topN);
  const rest = ranked.slice(topN);
  const series = top.map((item, index) => ({ key: `s${index}`, label: item.entry.schemaName }));
  if (rest.length > 0) series.push({ key: 'other', label: otherLabel });

  const dates = dailyVolumeTotals(entries).map((bucket) => bucket.date);
  const rows = dates.map((date) => {
    const row: Record<string, string | number> = { date: formatDate(date) };
    top.forEach((item, index) => {
      row[`s${index}`] = item.entry.dailyCounts.find((bucket) => bucket.date === date)?.count ?? 0;
    });
    if (rest.length > 0) {
      row.other = rest.reduce((sum, item) => sum + (item.entry.dailyCounts.find((bucket) => bucket.date === date)?.count ?? 0), 0);
    }
    return row;
  });
  return { rows, series };
}

/**
 * - `flowing`: accepted records landed in the picked environment.
 * - `rejected`: records arrived but are sitting in quarantine (also covers a schema that was never registered).
 * - `silent`: registered, but nothing received in the picked environment.
 */
export type SchemaChipStatus = 'flowing' | 'rejected' | 'silent';

export interface RequirementLaneSchema {
  kind: string;
  name: string;
  status: SchemaChipStatus;
  registered: boolean;
}

export interface RequirementLane {
  requirementId: SetupRequirementId;
  /** `null` when setup health could not be derived for the picked environment. */
  status: SetupRequirementStatus | null;
  schemas: RequirementLaneSchema[];
}

/**
 * Which registered schema feeds which setup requirement - the same name-based classification the
 * setup-health derivation uses - with each schema coloured by what the picked environment actually
 * received. A schema that only shows up as rejected (never registered) is included too, since that
 * is exactly the one an integrator needs to see. Registered schemas no requirement is about are
 * returned separately.
 */
export function buildRequirementLanes(
  families: readonly SchemaFamilyRef[],
  health: SetupEnvironmentHealth | null,
): { lanes: RequirementLane[]; unmapped: SchemaFamilyRef[] } {
  const unmapped: SchemaFamilyRef[] = [];
  const registeredByRequirement = new Map<SetupRequirementId, SchemaFamilyRef[]>();
  for (const family of families) {
    const requirementId =
      family.kind === 'event' || family.kind === 'entity' || family.kind === 'measure' ? classifySchemaForSetupRequirement(family.kind, family.name) : null;
    if (!requirementId) {
      unmapped.push(family);
      continue;
    }
    registeredByRequirement.set(requirementId, [...(registeredByRequirement.get(requirementId) ?? []), family]);
  }

  const lanes = SETUP_REQUIREMENT_IDS.map((requirementId): RequirementLane => {
    const result = health?.requirements.find((candidate) => candidate.requirementId === requirementId);
    const accepted = new Set(result?.acceptedSchemas.map((schema) => `${schema.kind}:${schema.name}`) ?? []);
    const rejected = new Set(result?.rejectedSchemas.map((schema) => `${schema.kind}:${schema.name}`) ?? []);
    const statusOf = (key: string): SchemaChipStatus => (accepted.has(key) ? 'flowing' : rejected.has(key) ? 'rejected' : 'silent');

    const registered = registeredByRequirement.get(requirementId) ?? [];
    const registeredKeys = new Set(registered.map((family) => `${family.kind}:${family.name}`));
    const schemas: RequirementLaneSchema[] = registered.map((family) => ({
      kind: family.kind,
      name: family.name,
      status: statusOf(`${family.kind}:${family.name}`),
      registered: true,
    }));
    for (const evidence of [...(result?.acceptedSchemas ?? []), ...(result?.rejectedSchemas ?? [])]) {
      const key = `${evidence.kind}:${evidence.name}`;
      if (registeredKeys.has(key)) continue;
      registeredKeys.add(key);
      schemas.push({ kind: evidence.kind, name: evidence.name, status: statusOf(key), registered: false });
    }
    const rank: Record<SchemaChipStatus, number> = { rejected: 0, flowing: 1, silent: 2 };
    schemas.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
    return { requirementId, status: result?.status ?? null, schemas };
  });

  return { lanes, unmapped };
}
