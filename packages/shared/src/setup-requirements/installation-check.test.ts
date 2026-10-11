import { describe, expect, it } from 'vitest';
import { buildInstallationReport } from './installation-check';
import type { SetupSchemaObservation } from './types';

const NOW = new Date('2026-10-05T12:00:00Z');

function observation(overrides: Partial<SetupSchemaObservation>): SetupSchemaObservation {
  return { environmentId: 'prod', kind: 'event', schemaName: 'signup', registered: true, lastAcceptedAt: null, openQuarantinedCount: 0, quarantineReasons: [], ...overrides };
}

describe('installation check', () => {
  const observations = [
    observation({ schemaName: 'touchpoint', lastAcceptedAt: '2026-10-05T11:59:00Z' }),
    observation({ schemaName: 'signup', lastAcceptedAt: '2026-10-05T10:00:00Z', openQuarantinedCount: 2, quarantineReasons: ['unregistered_field:plan_id'] }),
    observation({ schemaName: 'document_signed', lastAcceptedAt: '2026-09-30T10:00:00Z' }),
    observation({ schemaName: 'document_sent', openQuarantinedCount: 3, quarantineReasons: ['missing_required_field:document_id'] }),
    observation({ schemaName: 'subscription_state_change' }),
    observation({ schemaName: 'page_vew', registered: false, openQuarantinedCount: 1, quarantineReasons: ['schema_not_registered:page_vew'] }),
    observation({ kind: 'entity', schemaName: 'customer', lastAcceptedAt: '2026-10-05T11:00:00Z' }),
  ];

  it('gives each expected schema what really happened to it, with the next step', () => {
    const report = buildInstallationReport(observations, ['touchpoint', 'signup', 'document_signed', 'document_sent', 'subscription_state_change', 'cta_click', 'customer'], NOW);
    expect(report.status).toBe('attention');
    expect(report.schemas.map((schema) => [schema.name, schema.status])).toEqual([
      ['touchpoint', 'receiving'],
      ['signup', 'receiving'],
      ['document_signed', 'stale'],
      ['document_sent', 'quarantined'],
      ['subscription_state_change', 'registered_no_data'],
      ['cta_click', 'not_registered'],
      ['customer', 'receiving'],
    ]);
    expect(report.schemas[0].fix).toBeNull();
    // Arriving, but some rejected: still a step to take.
    expect(report.schemas[1].fix).toContain('unregistered_field:plan_id');
    expect(report.schemas[3].fix).toContain('missing_required_field:document_id');
    expect(report.schemas[5]).toMatchObject({ kind: null, registered: false, lastAcceptedAt: null });
    expect(report.schemas[6].kind).toBe('entity');
  });

  it('is ok only when every checked schema is receiving with nothing in quarantine', () => {
    expect(buildInstallationReport(observations, ['touchpoint', 'customer'], NOW).status).toBe('ok');
    expect(buildInstallationReport(observations, ['touchpoint', 'signup'], NOW).status).toBe('attention');
    expect(buildInstallationReport([], [], NOW)).toEqual({ status: 'attention', schemas: [] });
  });

  it('without expected names, checks every schema registered or sent, unregistered names included', () => {
    const names = buildInstallationReport(observations, [], NOW).schemas.map((schema) => schema.name);
    expect(names).toEqual(['customer', 'document_sent', 'document_signed', 'page_vew', 'signup', 'subscription_state_change', 'touchpoint']);
    expect(buildInstallationReport(observations, [], NOW).schemas.find((schema) => schema.name === 'page_vew')?.status).toBe('quarantined');
  });
});
