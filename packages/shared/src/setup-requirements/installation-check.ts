import type { SetupSchemaObservation } from './types';

/**
 * The installation check behind `GET /v1/ingest/verify`, the SDKs' `verify()` and the
 * Installation page: for each schema a site is expected to send, what actually happened to it in
 * one environment. Every status is derived from real ingest records (landed or quarantined) and the
 * schema registry - never from a manual "verified" flag and never from synthetic test data. Pure.
 */

export const INSTALLATION_SCHEMA_STATUSES = ['receiving', 'stale', 'quarantined', 'registered_no_data', 'not_registered'] as const;
export type InstallationSchemaStatus = (typeof INSTALLATION_SCHEMA_STATUSES)[number];

/** Accepted within this window counts as "receiving"; older than it is "stale". */
export const INSTALLATION_RECENT_MS = 24 * 60 * 60 * 1000;

export interface InstallationSchemaCheck {
  name: string;
  /** null when nothing by this name is registered or was ever sent. */
  kind: SetupSchemaObservation['kind'] | null;
  status: InstallationSchemaStatus;
  registered: boolean;
  lastAcceptedAt: string | null;
  openQuarantined: number;
  quarantineReasons: readonly string[];
  /** What to do next, in plain words; null when nothing is needed. */
  fix: string | null;
}

export interface InstallationReport {
  /** `ok` when every checked schema is receiving with nothing waiting in quarantine. */
  status: 'ok' | 'attention';
  schemas: InstallationSchemaCheck[];
}

function fixFor(status: InstallationSchemaStatus, name: string, reasons: readonly string[]): string | null {
  switch (status) {
    case 'receiving':
      return reasons.length ? `Records for "${name}" are arriving, but some were rejected: ${reasons.join(', ')}. Fix the sender, then replay them from Ingest health.` : null;
    case 'stale':
      return `"${name}" was received before, but nothing in the last 24 hours. Check that the code path that sends it still runs.`;
    case 'quarantined':
      return `Every "${name}" record was rejected: ${reasons.join(', ') || 'see Ingest health'}. Fix the sender (or the schema), then replay them from Ingest health.`;
    case 'registered_no_data':
      return `"${name}" is registered but nothing has arrived in this environment yet. Send one (with a key for this environment) and check again.`;
    case 'not_registered':
      return `"${name}" is not registered, so every record of it would be rejected. Register its schema (Schemas page or the register_schema MCP tool) before sending.`;
  }
}

/**
 * The check for `expected` schema names (any kind), or - when none are named - for every schema
 * registered or sent in the environment. `observations` must be for one environment.
 */
export function buildInstallationReport(observations: readonly SetupSchemaObservation[], expected: readonly string[] = [], now: Date = new Date()): InstallationReport {
  const byName = new Map<string, SetupSchemaObservation[]>();
  for (const observation of observations) byName.set(observation.schemaName, [...(byName.get(observation.schemaName) ?? []), observation]);
  const names = expected.length ? [...new Set(expected.map((name) => name.trim()).filter(Boolean))] : [...byName.keys()].sort();

  const schemas = names.map((name): InstallationSchemaCheck => {
    const found = byName.get(name) ?? [];
    // One name under several kinds is rare; report the one with the newest data.
    const observation = [...found].sort((a, b) => (b.lastAcceptedAt ?? '').localeCompare(a.lastAcceptedAt ?? '') || b.openQuarantinedCount - a.openQuarantinedCount)[0];
    const registered = found.some((entry) => entry.registered);
    const lastAcceptedAt = observation?.lastAcceptedAt ?? null;
    const openQuarantined = found.reduce((sum, entry) => sum + entry.openQuarantinedCount, 0);
    const quarantineReasons = [...new Set(found.flatMap((entry) => entry.quarantineReasons))];
    const recent = lastAcceptedAt !== null && now.getTime() - Date.parse(lastAcceptedAt) <= INSTALLATION_RECENT_MS;
    const status: InstallationSchemaStatus = recent
      ? 'receiving'
      : openQuarantined > 0
        ? 'quarantined'
        : lastAcceptedAt
          ? 'stale'
          : registered
            ? 'registered_no_data'
            : 'not_registered';
    return { name, kind: observation?.kind ?? null, status, registered, lastAcceptedAt, openQuarantined, quarantineReasons, fix: fixFor(status, name, quarantineReasons) };
  });

  return { status: schemas.length > 0 && schemas.every((schema) => schema.status === 'receiving' && schema.openQuarantined === 0) ? 'ok' : 'attention', schemas };
}
