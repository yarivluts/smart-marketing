import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildFunnelStepsQuery,
  confirmOnboardingFunnelSteps,
  createOrganizationWithOwner,
  createProject,
  ensureUserForFirebaseSession,
  queryProjectFunnelSteps,
  type WarehouseRow,
} from '../index';
import { connectToFirestoreEmulator } from '../test-utils/emulator';
import { dbtSeedPath, DuckDbWarehouseQueryExecutor, runDuckDbQueries } from '../test-utils/duckdb-warehouse-executor';

/**
 * B20: `query_funnel` proven on a REAL engine, not by the text of its SQL.
 *
 * The pre-fix query had exactly the text its tests asserted and still showed EasySign 4 -> 6 -> 6 -> 6 -> 6
 * (150% "conversion"): it counted events, not people, and every step on its own. So this file runs
 * {@link buildFunnelStepsQuery}'s own output — the same SQL production sends, built for DuckDB, which differs
 * only in the JSON text accessor — against an in-memory DuckDB.
 *
 * The fixture is `@growthos/dbt-transform`'s own seed (`raw_records.csv`, projects `proj_25` and `proj_26`),
 * shaped into `events` exactly as `stg_events`/`events` shape it. `bridge_identity` is the edge list the dbt
 * model derives from those same rows, which `assert_funnel_identity_fixture_b20` pins over there, so a change to
 * the identity rules breaks that test rather than silently invalidating this one.
 */

beforeAll(async () => {
  await connectToFirestoreEmulator('funnel-steps-duckdb-tests');
});

const EASYSIGN_FUNNEL = ['touchpoint', 'signup', 'document_created', 'document_sent', 'document_signed'];

/** Exactly what `assert_funnel_identity_fixture_b20` expects `bridge_identity` to hold for the fixture. */
const FIXTURE_BRIDGE_IDENTITY: ReadonlyArray<readonly [projectId: string, environmentId: string, anonId: string, customerId: string]> = [
  ['proj_25', 'env_dev', 'anon-9a59', 'cust-D3CM'],
  ['proj_25', 'env_dev', 'anon-1cbd', 'cust-taY2'],
  ['proj_26', 'env_dev', 'p1-anon', 'c1'],
  ['proj_26', 'env_dev', 'p2-anon', 'c2'],
  ['proj_26', 'env_dev', 'p3-anon', 'c3'],
  ['proj_26', 'env_dev', 'p6-anon', 'c6'],
  ['proj_26', 'env_dev', 'p7-anon', 'c7'],
  ['proj_26', 'env_dev', 'p8a', 'c8'],
  ['proj_26', 'env_dev', 'p8b', 'c8'],
  ['proj_26', 'env_dev', 'p9-anon', 'c9'],
  ['proj_26', 'env_other', 'z1', 'z1c'],
  ['proj_26', 'env_other', 'p4-anon', 'c9'],
];

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const CREATE_BRIDGE_IDENTITY =
  'CREATE TABLE bridge_identity (organization_id VARCHAR, project_id VARCHAR, environment_id VARCHAR, anon_id VARCHAR, customer_id VARCHAR)';

/**
 * Loads the dbt seed's fixture rows as `events` (the `stg_events` + `events` projection: `client_id` is the
 * entity id, `properties` the envelope's properties object, `occurred_at` the payload's `ts` falling back to
 * `landed_at`) plus the fixture's `bridge_identity`. `rename` re-homes `proj_25` under a real Firestore
 * organization/project so the whole service can run against it.
 */
function seedFixtureSetup(rename?: { organizationId: string; projectId: string }): string[] {
  const organizationExpr = rename ? `CASE WHEN project_id = 'proj_25' THEN ${sqlString(rename.organizationId)} ELSE organization_id END` : 'organization_id';
  const projectExpr = rename ? `CASE WHEN project_id = 'proj_25' THEN ${sqlString(rename.projectId)} ELSE project_id END` : 'project_id';
  const bridgeRows = FIXTURE_BRIDGE_IDENTITY.map(([projectId, environmentId, anonId, customerId]) => {
    const renamed = rename && projectId === 'proj_25';
    return `(${sqlString(renamed ? rename.organizationId : 'org_1')}, ${sqlString(renamed ? rename.projectId : projectId)}, ${sqlString(environmentId)}, ${sqlString(anonId)}, ${sqlString(customerId)})`;
  });
  return [
    `CREATE TABLE raw_records AS SELECT * FROM read_csv(${sqlString(dbtSeedPath('raw_records.csv'))}, header = true, all_varchar = true)`,
    `CREATE TABLE events AS
      SELECT
        client_id AS event_id,
        ${organizationExpr} AS organization_id,
        ${projectExpr} AS project_id,
        environment_id,
        schema_name AS event_type,
        client_id AS entity_id,
        json_extract(CAST(payload AS JSON), '$.properties') AS properties,
        coalesce(try_cast(json_extract_string(CAST(payload AS JSON), '$.ts') AS TIMESTAMP), CAST(landed_at AS TIMESTAMP)) AS occurred_at
      FROM raw_records
      WHERE kind = 'event' AND project_id IN ('proj_25', 'proj_26')`,
    CREATE_BRIDGE_IDENTITY,
    `INSERT INTO bridge_identity VALUES ${bridgeRows.join(', ')}`,
  ];
}

/** The query `queryProjectFunnelSteps` ran before B20, kept verbatim to prove the fixture reproduces the bug. */
function preB20Query(projectId: string, environmentId: string, steps: readonly string[]) {
  const stepParams = steps.map((_, index) => `@funnelEvent${index}`);
  return {
    sql: `SELECT event_type, COUNT(DISTINCT entity_id) AS customer_count FROM events WHERE organization_id = @organizationId AND project_id = @projectId AND environment_id = @environmentId AND event_type IN (${stepParams.join(', ')}) GROUP BY event_type`,
    params: { organizationId: 'org_1', projectId, environmentId, ...Object.fromEntries(steps.map((name, index) => [`funnelEvent${index}`, name])) },
  };
}

function countsByStep(rows: WarehouseRow[], stepCount: number): number[] {
  const byIndex = new Map(rows.map((row) => [Number(row.step_index), Number(row.people_count)]));
  return Array.from({ length: stepCount }, (_, index) => byIndex.get(index) ?? 0);
}

function funnelQuery(projectId: string, environmentId: string | undefined, steps: readonly string[]) {
  return buildFunnelStepsQuery({
    organizationId: 'org_1',
    projectId,
    ...(environmentId !== undefined ? { environmentId } : {}),
    eventSchemaNames: steps,
    dialect: 'duckdb',
  });
}

function expectNonIncreasing(counts: readonly number[]): void {
  for (let index = 1; index < counts.length; index++) {
    expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]);
  }
}

describe('query_funnel on DuckDB, over the dbt fixture seed (B20)', () => {
  // One DuckDB run for every fixture query in this block.
  let results: WarehouseRow[][];
  beforeAll(() => {
    results = runDuckDbQueries(seedFixtureSetup(), [
      preB20Query('proj_25', 'env_dev', EASYSIGN_FUNNEL),
      funnelQuery('proj_25', 'env_dev', EASYSIGN_FUNNEL),
      funnelQuery('proj_26', 'env_dev', EASYSIGN_FUNNEL),
      funnelQuery('proj_26', 'env_other', EASYSIGN_FUNNEL),
      funnelQuery('proj_26', undefined, EASYSIGN_FUNNEL),
    ]);
  });

  it('reproduces the bug with the pre-fix query: EasySign reads 4 -> 6 -> 6 -> 6 -> 6', () => {
    const byEvent = new Map(results[0].map((row) => [String(row.event_type), Number(row.customer_count)]));
    expect(EASYSIGN_FUNNEL.map((name) => byEvent.get(name) ?? 0)).toEqual([4, 6, 6, 6, 6]);
  });

  it("counts EasySign's real shape as 4 -> 2 -> 2 -> 2 -> 2: stitched visitors are one person, customers with no touchpoint never enter", () => {
    expect(countsByStep(results[1], EASYSIGN_FUNNEL.length)).toEqual([4, 2, 2, 2, 2]);
  });

  it('counts the edge-case fixture as 9 -> 8 -> 4 -> 3 -> 2 (skip, out of order, repeats, anon-only, legacy ids, two devices, a tie)', () => {
    // touchpoint:       c1 c2 c3 p4-anon legacy-5 c6 c7 c8 c9            = 9
    // signup after it:  all but c6 (signed up before the touchpoint)      = 8
    // created after:    c1 c3 c7 c8 (c2 skipped it; p4, legacy-5, c9 stop) = 4
    // sent after:       c1 c3 (second send) c8 — c7 never sent             = 3
    // signed after:     c1 c8 — c3 signed before its qualifying send       = 2
    const counts = countsByStep(results[2], EASYSIGN_FUNNEL.length);
    expect(counts).toEqual([9, 8, 4, 3, 2]);
    expectNonIncreasing(counts);
  });

  it("scopes events and identity edges to the requested environment: env_other only has its own one visitor", () => {
    // z1 (touchpoint) -> z1c (signup) through env_other's edge. env_other's p4-anon -> c9 edge has no
    // touchpoint there, and must not merge env_dev's P4 into P9 (proven by the 9 above, not 8).
    expect(countsByStep(results[3], EASYSIGN_FUNNEL.length)).toEqual([1, 1, 0, 0, 0]);
  });

  it('with no environment to scope to, every environment is read — and an identity edge still applies only in its own', () => {
    // env_dev's 9 people plus env_other's z1c. env_dev's p4-anon stays its own person: the p4-anon -> c9 edge
    // belongs to env_other, and following it would have merged P4 into P9 (9, not 10).
    expect(countsByStep(results[4], EASYSIGN_FUNNEL.length)).toEqual([10, 9, 4, 3, 2]);
  });
});

describe('queryProjectFunnelSteps end to end on DuckDB (B20)', () => {
  it("returns EasySign's funnel as 4 -> 2 -> 2 -> 2 -> 2 people, overall 50%, with no rate above 1", async () => {
    const owner = await ensureUserForFirebaseSession({ firebaseUid: `uid-${Math.random().toString(36).slice(2)}`, email: `owner-${Math.random().toString(36).slice(2)}@example.com` });
    const { organization } = await createOrganizationWithOwner({ name: 'Funnel DuckDB Org', ownerUserId: owner.id });
    const { project } = await createProject({ organizationId: organization.id, name: 'EasySign' });
    await confirmOnboardingFunnelSteps({
      organizationId: organization.id,
      projectId: project.id,
      userId: owner.id,
      steps: EASYSIGN_FUNNEL.map((eventSchemaName, order) => ({ eventSchemaName, stageKey: order === 0 ? 'awareness' : 'other', order })),
    });
    const executor = new DuckDbWarehouseQueryExecutor(seedFixtureSetup({ organizationId: organization.id, projectId: project.id }));

    const steps = await queryProjectFunnelSteps({ organizationId: organization.id, projectId: project.id, environmentId: 'env_dev', executor });

    expect(steps.map((step) => [step.eventSchemaName, step.customerCount])).toEqual([
      ['touchpoint', 4],
      ['signup', 2],
      ['document_created', 2],
      ['document_sent', 2],
      ['document_signed', 2],
    ]);
    expect(steps.map((step) => step.conversionRateFromFirst)).toEqual([1, 0.5, 0.5, 0.5, 0.5]);
    expect(executor.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Differential test: random projects, DuckDB vs an independent brute-force reference.
// ---------------------------------------------------------------------------------------------------------

interface RandomEvent {
  environmentId: string;
  eventType: string;
  entityId: string;
  properties: Record<string, string>;
  minute: number;
}

/** Deterministic PRNG (mulberry32) so a failure reproduces. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANDOM_EVENT_TYPES = ['touchpoint', 'signup', 'document_created', 'document_sent', 'page_view'];

function randomProject(seed: number): { events: RandomEvent[]; bridge: Array<[environmentId: string, anonId: string, customerId: string]> } {
  const random = prng(seed);
  const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  const events: RandomEvent[] = [];
  const bridge: Array<[string, string, string]> = [];
  let eventCounter = 0;
  const nextId = () => `ev-${seed}-${eventCounter++}`;

  for (let person = 0; person < 8; person++) {
    const environmentId = random() < 0.8 ? 'env_dev' : 'env_other';
    const kind = random();
    const anons = [`a${seed}-${person}`, ...(random() < 0.3 ? [`a${seed}-${person}-b`] : [])];
    const customer = `c${seed}-${person}`;
    const identified = kind < 0.6;
    const legacy = kind >= 0.9;
    if (identified) {
      for (const anon of anons) bridge.push([environmentId, anon, customer]);
    }
    const eventCount = 1 + Math.floor(random() * 7);
    for (let n = 0; n < eventCount; n++) {
      const eventType = pick(RANDOM_EVENT_TYPES);
      const minute = Math.floor(random() * 12); // few distinct minutes: ties are common
      const anon = pick(anons);
      if (legacy) {
        events.push({ environmentId, eventType, entityId: `legacy-${seed}-${person}`, properties: {}, minute });
      } else if (eventType === 'touchpoint' && random() < 0.3) {
        // Snippet style: the touchpoint's own id is the visitor id.
        events.push({ environmentId, eventType, entityId: anon, properties: {}, minute });
      } else if (identified && eventType !== 'touchpoint' && random() < 0.7) {
        events.push({ environmentId, eventType, entityId: nextId(), properties: { customer_id: customer, ...(random() < 0.5 ? { anon_id: anon } : {}) }, minute });
      } else {
        events.push({ environmentId, eventType, entityId: nextId(), properties: { anon_id: anon }, minute });
      }
    }
  }
  return { events, bridge };
}

/** The person an event belongs to, per the documented identity rules (see `buildFunnelStepsQuery`). */
function referencePerson(event: RandomEvent, bridge: ReadonlyMap<string, string>): string {
  const anonKey = event.properties.anon_id ?? (event.eventType === 'touchpoint' ? event.entityId : undefined);
  return (
    event.properties.customer_id ??
    (anonKey !== undefined ? bridge.get(`${event.environmentId}|${anonKey}`) : undefined) ??
    event.properties.anon_id ??
    event.entityId
  );
}

/** Brute force, deliberately not the greedy the SQL uses: the deepest step reachable by ANY in-order chain. */
function deepestStepReached(minutesByStep: ReadonlyArray<readonly number[]>): number {
  let deepest = -1;
  const explore = (step: number, after: number) => {
    if (step === minutesByStep.length) return;
    for (const minute of minutesByStep[step]) {
      if (minute >= after) {
        deepest = Math.max(deepest, step);
        explore(step + 1, minute);
      }
    }
  };
  explore(0, -Infinity);
  return deepest;
}

function referenceCounts(events: readonly RandomEvent[], bridgeRows: ReadonlyArray<readonly [string, string, string]>, environmentId: string, steps: readonly string[]): number[] {
  const bridge = new Map(bridgeRows.map(([env, anon, customer]) => [`${env}|${anon}`, customer]));
  const byPerson = new Map<string, RandomEvent[]>();
  for (const event of events.filter((candidate) => candidate.environmentId === environmentId)) {
    const person = referencePerson(event, bridge);
    byPerson.set(person, [...(byPerson.get(person) ?? []), event]);
  }
  const counts = steps.map(() => 0);
  for (const personEvents of byPerson.values()) {
    const minutesByStep = steps.map((step) => personEvents.filter((event) => event.eventType === step).map((event) => event.minute));
    const deepest = deepestStepReached(minutesByStep);
    for (let step = 0; step <= deepest; step++) counts[step]++;
  }
  return counts;
}

describe('query_funnel on DuckDB vs a brute-force reference, over random projects (B20)', () => {
  const PROJECT_COUNT = 40;
  const FUNNELS = [
    ['touchpoint', 'signup', 'document_created', 'document_sent'],
    // A repeated step: the same occurrence may satisfy both (ties are in order), which the reference agrees with.
    ['signup', 'document_created', 'signup'],
  ];

  it('agrees on every project and funnel, and never increases along a funnel', () => {
    const projects = Array.from({ length: PROJECT_COUNT }, (_, index) => ({ projectId: `rand_${index}`, ...randomProject(index + 1) }));
    const base = Date.UTC(2026, 8, 1, 0, 0, 0);
    const eventRows = projects.flatMap(({ projectId, events }) =>
      events.map(
        (event) =>
          `('org_1', ${sqlString(projectId)}, ${sqlString(event.environmentId)}, ${sqlString(event.eventType)}, ${sqlString(event.entityId)}, CAST(${sqlString(JSON.stringify(event.properties))} AS JSON), CAST(${sqlString(new Date(base + event.minute * 60_000).toISOString().replace('T', ' ').replace('Z', ''))} AS TIMESTAMP))`,
      ),
    );
    const bridgeRows = projects.flatMap(({ projectId, bridge }) =>
      bridge.map(([environmentId, anonId, customerId]) => `('org_1', ${sqlString(projectId)}, ${sqlString(environmentId)}, ${sqlString(anonId)}, ${sqlString(customerId)})`),
    );
    const setup = [
      'CREATE TABLE events (organization_id VARCHAR, project_id VARCHAR, environment_id VARCHAR, event_type VARCHAR, entity_id VARCHAR, properties JSON, occurred_at TIMESTAMP)',
      `INSERT INTO events VALUES ${eventRows.join(', ')}`,
      CREATE_BRIDGE_IDENTITY,
      ...(bridgeRows.length > 0 ? [`INSERT INTO bridge_identity VALUES ${bridgeRows.join(', ')}`] : []),
    ];
    const cases = projects.flatMap((project) => FUNNELS.map((steps) => ({ project, steps })));

    const results = runDuckDbQueries(
      setup,
      cases.map(({ project, steps }) => funnelQuery(project.projectId, 'env_dev', steps)),
    );

    let nonTrivial = 0;
    cases.forEach(({ project, steps }, index) => {
      const actual = countsByStep(results[index], steps.length);
      expect({ project: project.projectId, steps, counts: actual }).toEqual({
        project: project.projectId,
        steps,
        counts: referenceCounts(project.events, project.bridge, 'env_dev', steps),
      });
      expectNonIncreasing(actual);
      if (actual[0] > actual[actual.length - 1]) nonTrivial++;
    });
    // Guard against a generator that only ever produces empty or flat funnels.
    expect(nonTrivial).toBeGreaterThan(cases.length / 4);
  });
});
