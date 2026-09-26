import { describe, expect, it } from 'vitest';
import {
  buildInstallationGapsOutput,
  buildSetupHealthOutput,
  classifySchemaForSetupRequirement,
  deriveSetupHealth,
  selectSetupFocusEnvironment,
  SETUP_REQUIREMENTS,
  type SetupHealthReport,
  type SetupRequirementId,
  type SetupSchemaObservation,
} from './index';
import { EASYSIGN_DEV_OBSERVATIONS, EASYSIGN_ENVIRONMENTS } from './__fixtures__/easysign-dev';

const CONTEXT = {
  organizationId: 'JGTxet9aGXV6xUPWYidR',
  projectId: 'LYierelkF0eKnLmIrS9u',
  webAppUrl: 'https://web.example.test/',
  apiBaseUrl: 'https://api.example.test',
};

function statusesIn(report: SetupHealthReport, environmentName: string): Record<SetupRequirementId, string> {
  const environment = report.environments.find((candidate) => candidate.environmentName === environmentName)!;
  return Object.fromEntries(environment.requirements.map((result) => [result.requirementId, result.status])) as Record<SetupRequirementId, string>;
}

function observation(overrides: Partial<SetupSchemaObservation> & Pick<SetupSchemaObservation, 'schemaName' | 'kind'>): SetupSchemaObservation {
  return { environmentId: 'env-dev', registered: true, lastAcceptedAt: null, openQuarantinedCount: 0, quarantineReasons: [], ...overrides };
}

/** Every string anywhere in a JSON-able value. */
function allStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

describe('EasySign dev, the reference integration', () => {
  const report = deriveSetupHealth(EASYSIGN_ENVIRONMENTS, EASYSIGN_DEV_OBSERVATIONS);

  it('reads signups, documents, landing-page attribution and the customer entity as connected, ads and billing as honest gaps', () => {
    expect(statusesIn(report, 'dev')).toEqual({
      landing_page_attribution: 'connected',
      signups: 'connected',
      product_usage: 'connected',
      customer_profiles: 'connected',
      billing: 'gap',
      ad_spend: 'gap',
    });
  });

  it('does not let dev traffic make prod or staging look connected', () => {
    for (const environment of ['prod', 'staging']) {
      expect(new Set(Object.values(statusesIn(report, environment)))).toEqual(new Set(['gap']));
    }
  });

  it('lists environments dev, staging, prod whatever order they were stored in', () => {
    expect(report.environments.map((environment) => environment.environmentName)).toEqual(['dev', 'staging', 'prod']);
  });

  it('names the documents it counted as product usage', () => {
    const dev = report.environments.find((environment) => environment.environmentName === 'dev')!;
    const usage = dev.requirements.find((result) => result.requirementId === 'product_usage')!;
    expect(usage.acceptedSchemas.map((schema) => schema.name)).toEqual(['document_signed', 'document_sent', 'document_created']);
    expect(usage.lastAcceptedAt).toBe('2026-09-25T16:15:02.000Z');
  });

  it('audit_installation_gaps for dev returns exactly billing and ad spend, each with steps and the environments where it is connected', () => {
    const focus = selectSetupFocusEnvironment(report, { environmentName: 'dev' })!;
    const output = buildInstallationGapsOutput(report, focus, CONTEXT);
    expect(output.gaps.map((gap) => gap.requirement_id)).toEqual(['billing', 'ad_spend']);
    expect(output.connected.map((entry) => entry.requirement_id)).toEqual(['landing_page_attribution', 'signups', 'product_usage', 'customer_profiles']);
    for (const gap of output.gaps) {
      expect(gap.how_to_fix.length).toBeGreaterThan(0);
      expect(gap.connected_in_other_environments).toEqual([]);
    }
  });

  it('audit for prod says which gaps are already connected in dev', () => {
    const focus = selectSetupFocusEnvironment(report, {})!;
    expect(focus.environmentName).toBe('prod');
    const output = buildInstallationGapsOutput(report, focus, CONTEXT);
    const signups = output.gaps.find((gap) => gap.requirement_id === 'signups')!;
    expect(signups.connected_in_other_environments).toEqual(['dev']);
    expect(signups.detail).toContain('Registered but never received here: "signup"');
  });
});

describe('a wrong name-based inference is visible, never a bare "connected"', () => {
  // EasySign's stream as it reported it on 2026-09-26: billing via subscription_state_change, and a
  // WhatsApp lead click whose name says nothing about which requirement it serves.
  const report = deriveSetupHealth(EASYSIGN_ENVIRONMENTS, [
    ...EASYSIGN_DEV_OBSERVATIONS,
    observation({ schemaName: 'subscription_state_change', kind: 'event', lastAcceptedAt: '2026-09-25T16:20:00.000Z' }),
    observation({ schemaName: 'lead_whatsapp_click', kind: 'event', lastAcceptedAt: '2026-09-25T16:21:00.000Z' }),
  ]);
  const focus = selectSetupFocusEnvironment(report, { environmentName: 'dev' })!;

  it('get_setup_health names the schemas behind every requirement and marks the match as inferred', () => {
    const output = buildSetupHealthOutput(report, focus, CONTEXT);
    const byId = Object.fromEntries(output.requirements.map((requirement) => [requirement.id, requirement]));
    expect(byId.billing.status).toBe('connected');
    expect(byId.billing.schemas.accepted).toEqual(['subscription_state_change']);
    // Where the ambiguous name landed is on the page, so a wrong guess can be seen and questioned.
    expect(byId.product_usage.schemas.accepted).toContain('lead_whatsapp_click');
    expect(byId.product_usage.schemas.accepted).toContain('document_signed');
    expect(byId.ad_spend.schemas).toEqual({ accepted: [], rejected: [], registered_but_silent: [] });
    for (const requirement of output.requirements) {
      expect(requirement.mapping).toBe('inferred_from_schema_name');
    }
    expect(output.schema_mapping).toContain('inference');
  });

  it('audit_installation_gaps marks both gaps and connected entries as inferred', () => {
    const output = buildInstallationGapsOutput(report, focus, CONTEXT);
    expect(output.gaps.map((gap) => gap.requirement_id)).toEqual(['ad_spend']);
    expect(output.gaps[0].mapping).toBe('inferred_from_schema_name');
    const billing = output.connected.find((entry) => entry.requirement_id === 'billing')!;
    expect(billing).toMatchObject({ schemas: ['subscription_state_change'], mapping: 'inferred_from_schema_name' });
    expect(output.schema_mapping).toContain('order_viewed');
  });

  it('a credential that sees one environment gets null, not [], for the others', () => {
    const output = buildInstallationGapsOutput(report, focus, { ...CONTEXT, otherEnvironmentsVisible: false });
    expect(output.gaps[0].connected_in_other_environments).toBeNull();
  });
});

describe('B1: status comes from accepted ingest records, per environment, never from a flag', () => {
  const environments = [
    { id: 'env-dev', name: 'dev' },
    { id: 'env-prod', name: 'prod' },
  ];

  it('a registered schema with nothing accepted is a gap, not connected', () => {
    const report = deriveSetupHealth(environments, [observation({ schemaName: 'signup', kind: 'event', registered: true })]);
    expect(statusesIn(report, 'dev').signups).toBe('gap');
  });

  it('records that were only rejected read as an error, with their reasons', () => {
    const report = deriveSetupHealth(environments, [
      observation({ schemaName: 'subscription_state_change', kind: 'event', registered: false, openQuarantinedCount: 3, quarantineReasons: ['schema_not_registered:subscription_state_change'] }),
    ]);
    expect(statusesIn(report, 'dev').billing).toBe('error');
    const focus = selectSetupFocusEnvironment(report, { environmentName: 'dev' })!;
    const gap = buildInstallationGapsOutput(report, focus, CONTEXT).gaps.find((entry) => entry.requirement_id === 'billing')!;
    expect(gap.detail).toContain('3 records were rejected');
    expect(gap.detail).toContain('schema_not_registered:subscription_state_change');
    // The fix for rejected records starts with reading why they were rejected.
    expect(gap.how_to_fix[0].web_page_url).toBe(`https://web.example.test/en/orgs/${CONTEXT.organizationId}/projects/${CONTEXT.projectId}/ingest-health`);
  });

  it('one accepted record makes it connected even beside rejected ones, and the rejects are still reported', () => {
    const report = deriveSetupHealth(environments, [
      observation({ schemaName: 'signup', kind: 'event', lastAcceptedAt: '2026-09-25T10:00:00.000Z', openQuarantinedCount: 2, quarantineReasons: ['unregistered_field:plan'] }),
    ]);
    const dev = report.environments.find((environment) => environment.environmentName === 'dev')!;
    const signups = dev.requirements.find((result) => result.requirementId === 'signups')!;
    expect(signups.status).toBe('connected');
    const output = buildSetupHealthOutput(report, dev, CONTEXT);
    expect(output.requirements.find((entry) => entry.id === 'signups')!.detail).toContain('2 other records are rejected');
  });

  it('judges each environment on its own records', () => {
    const report = deriveSetupHealth(environments, [
      observation({ environmentId: 'env-dev', schemaName: 'ad_spend', kind: 'measure', lastAcceptedAt: '2026-09-25T00:00:00.000Z' }),
      observation({ environmentId: 'env-prod', schemaName: 'ad_spend', kind: 'measure' }),
    ]);
    expect(statusesIn(report, 'dev').ad_spend).toBe('connected');
    expect(statusesIn(report, 'prod').ad_spend).toBe('gap');
  });

  it('ignores observations for an environment it was not given rather than crediting another one', () => {
    const report = deriveSetupHealth(environments, [observation({ environmentId: 'env-other', schemaName: 'signup', kind: 'event', lastAcceptedAt: '2026-09-25T00:00:00.000Z' })]);
    expect(statusesIn(report, 'dev').signups).toBe('gap');
    expect(statusesIn(report, 'prod').signups).toBe('gap');
  });
});

describe('monetization is satisfiable without Stripe (KAN-110)', () => {
  const environments = [{ id: 'env-dev', name: 'dev' }];

  it('accepted subscription_state_change events connect billing', () => {
    const report = deriveSetupHealth(environments, [observation({ schemaName: 'subscription_state_change', kind: 'event', lastAcceptedAt: '2026-09-25T00:00:00.000Z' })]);
    expect(statusesIn(report, 'dev').billing).toBe('connected');
  });

  it("so do the Stripe connector's records", () => {
    for (const [schemaName, kind] of [
      ['stripe_invoice', 'event'],
      ['stripe_charge', 'event'],
      ['stripe_refund', 'event'],
      ['stripe_failed_payment', 'event'],
      ['stripe_subscription', 'entity'],
    ] as const) {
      expect(classifySchemaForSetupRequirement(kind, schemaName)).toBe('billing');
    }
  });

  it('the billing steps offer the non-Stripe path first', () => {
    const billing = SETUP_REQUIREMENTS.find((requirement) => requirement.id === 'billing')!;
    expect(billing.recommendations[0].action).toContain('subscription_state_change');
    expect(billing.recommendations[0].action).toContain('Stripe is not required');
  });
});

describe('classifySchemaForSetupRequirement', () => {
  it.each([
    ['event', 'touchpoint', 'landing_page_attribution'],
    ['event', 'signup', 'signups'],
    ['event', 'user_signed_up', 'signups'],
    ['event', 'accountCreated', 'signups'],
    ['event', 'registration_completed', 'signups'],
    // "created"/"signed" alone are not signups: EasySign's document lifecycle is product usage.
    ['event', 'document_created', 'product_usage'],
    ['event', 'easysign.document_signed', 'product_usage'],
    ['event', 'reorder_list_viewed', 'product_usage'],
    ['event', 'subscription_state_change', 'billing'],
    ['event', 'order_paid', 'billing'],
    ['entity', 'customer', 'customer_profiles'],
    ['entity', 'account', 'customer_profiles'],
    ['entity', 'stripe_subscription', 'billing'],
    ['measure', 'ad_spend', 'ad_spend'],
    ['measure', 'daily_spend', 'ad_spend'],
    ['measure', 'mrr', 'billing'],
    ['measure', 'page_load_ms', null],
    ['event', '', null],
  ] as const)('%s "%s" -> %s', (kind, name, expected) => {
    expect(classifySchemaForSetupRequirement(kind, name)).toBe(expected);
  });
});

describe('B3: tool output is resolved English, never translation keys', () => {
  const report = deriveSetupHealth(EASYSIGN_ENVIRONMENTS, [
    ...EASYSIGN_DEV_OBSERVATIONS,
    observation({ schemaName: 'subscription_state_change', kind: 'event', registered: false, openQuarantinedCount: 1, quarantineReasons: ['schema_not_registered:subscription_state_change'] }),
  ]);
  /** "Setup.foo.bar", "SetupRequirements.webSdkImpact": a capitalised namespace, a dot, an identifier. */
  const KEY_LIKE = /\b[A-Z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9_]*)+\b/;

  for (const environmentName of ['dev', 'staging', 'prod']) {
    it(`${environmentName}: get_setup_health and audit_installation_gaps contain no key-like strings`, () => {
      const focus = selectSetupFocusEnvironment(report, { environmentName })!;
      const strings = [...allStrings(buildSetupHealthOutput(report, focus, CONTEXT)), ...allStrings(buildInstallationGapsOutput(report, focus, CONTEXT))];
      expect(strings.filter((value) => KEY_LIKE.test(value))).toEqual([]);
    });
  }

  it('the key-like check itself catches the defect it is for', () => {
    expect(KEY_LIKE.test('SetupRequirements.webSdkImpact')).toBe(true);
    expect(KEY_LIKE.test('Setup.foo.bar')).toBe(true);
    expect(KEY_LIKE.test('Customer 360 and search_customers have no rows.')).toBe(false);
  });

  it('every impact_summary is a sentence', () => {
    const focus = selectSetupFocusEnvironment(report, { environmentName: 'prod' })!;
    for (const gap of buildInstallationGapsOutput(report, focus, CONTEXT).gaps) {
      expect(gap.impact_summary.split(' ').length).toBeGreaterThan(8);
      expect(gap.impact_summary.endsWith('.')).toBe(true);
    }
  });
});

describe('B2: rendered steps only point at the deployment they came from', () => {
  it('builds every URL from the configured base URLs and never a hard-coded host', () => {
    const report = deriveSetupHealth(EASYSIGN_ENVIRONMENTS, []);
    const focus = selectSetupFocusEnvironment(report, { environmentName: 'prod' })!;
    const steps = buildInstallationGapsOutput(report, focus, CONTEXT).gaps.flatMap((gap) => gap.how_to_fix);
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      if (step.web_page_url) expect(step.web_page_url.startsWith('https://web.example.test/en/orgs/')).toBe(true);
      if (step.api_endpoint) expect(step.api_endpoint).toMatch(/^(GET|POST) https:\/\/api\.example\.test\/v1\//);
    }
    // No catalog text may embed its own URL: every link has to come from a structured, testable field.
    for (const requirement of SETUP_REQUIREMENTS) {
      for (const text of allStrings(requirement)) {
        expect(text).not.toMatch(/https?:\/\//);
      }
    }
  });
});
