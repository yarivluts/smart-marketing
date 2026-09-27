import { describe, expect, it } from 'vitest';
import { buildCustomerEntityCoverageQuery } from './customer-coverage.service';
import { runDuckDbQueries } from '../test-utils/duckdb-warehouse-executor';

/**
 * The customer-coverage SQL on a real engine (DuckDB, the dialect the dbt build runs locally), over
 * `events`/`entities` tables shaped like the dbt core models: the rollout case EasySign described
 * (100 customers in events, 5 with a customer record), de-duplication on both sides, and scoping.
 */

const ORG = 'org-1';
const PROJECT = 'proj-1';
const DEV = 'env-dev';

function sql(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function eventRow(customerId: string | null, overrides: { environmentId?: string; projectId?: string; eventId?: string } = {}): string {
  const properties = customerId === null ? '{}' : JSON.stringify({ customer_id: customerId });
  return `(${sql(overrides.eventId ?? `evt-${Math.random().toString(36).slice(2)}`)}, ${sql(ORG)}, ${sql(overrides.projectId ?? PROJECT)}, ${sql(overrides.environmentId ?? DEV)}, 'signup', ${sql(properties)})`;
}

function entityRow(entityId: string, schemaName = 'customer', environmentId = DEV): string {
  return `(${sql(ORG)}, ${sql(PROJECT)}, ${sql(environmentId)}, ${sql(schemaName)}, ${sql(entityId)})`;
}

function coverage(events: string[], entities: string[], schemas: readonly string[] = ['customer']) {
  const setup = [
    'CREATE TABLE events (event_id VARCHAR, organization_id VARCHAR, project_id VARCHAR, environment_id VARCHAR, event_type VARCHAR, properties JSON)',
    'CREATE TABLE entities (organization_id VARCHAR, project_id VARCHAR, environment_id VARCHAR, schema_name VARCHAR, entity_id VARCHAR)',
    ...(events.length > 0 ? [`INSERT INTO events VALUES ${events.join(', ')}`] : []),
    ...(entities.length > 0 ? [`INSERT INTO entities VALUES ${entities.join(', ')}`] : []),
  ];
  const query = buildCustomerEntityCoverageQuery({ organizationId: ORG, projectId: PROJECT, environmentId: DEV, customerEntitySchemas: schemas }, 'duckdb');
  const [[row]] = runDuckDbQueries(setup, [query]);
  return { eventCustomers: Number(row.event_customers), withCustomerRecord: Number(row.with_customer_record) };
}

const range = (count: number) => Array.from({ length: count }, (_, index) => `cust-${index + 1}`);

describe('buildCustomerEntityCoverageQuery on DuckDB', () => {
  it('the rollout case: 100 customers in events, 5 with a customer record', () => {
    // Each customer has two events; only the five newest signups ever sent an entity.
    const events = range(100).flatMap((id) => [eventRow(id), eventRow(id)]);
    expect(coverage(events, range(5).map((id) => entityRow(id)))).toEqual({ eventCustomers: 100, withCustomerRecord: 5 });
  }, 120_000);

  it('full coverage, and an entity for someone with no events does not inflate it', () => {
    const events = range(12).map((id) => eventRow(id));
    expect(coverage(events, [...range(12).map((id) => entityRow(id)), entityRow('cust-only-entity')])).toEqual({ eventCustomers: 12, withCustomerRecord: 12 });
  }, 120_000);

  it('is an intersection on id, not a row ratio: 60 entity-only rows cannot hide 50 event customers with no record', () => {
    // 100 customers in events, 50 of them with a customer record, plus 60 records for ids no event
    // names (imported CRM rows, probes). A row ratio would read 110/100; the gap is 50 of 100.
    const events = range(100).map((id) => eventRow(id));
    const entities = [...range(50).map((id) => entityRow(id)), ...Array.from({ length: 60 }, (_, index) => entityRow(`crm-only-${index + 1}`))];
    expect(coverage(events, entities)).toEqual({ eventCustomers: 100, withCustomerRecord: 50 });
  }, 120_000);

  it('EasySign dev shape: 9 event customers all with records, 5 probe-only entities beside them - 9 of 9, not 14 of 9', () => {
    const events = range(9).map((id) => eventRow(id));
    const entities = [...range(9).map((id) => entityRow(id)), ...['b13-probe-1', 'b13-probe-2', 'b14-probe-1', 'b14-probe-2', 'b14-probe-3'].map((id) => entityRow(id))];
    expect(coverage(events, entities)).toEqual({ eventCustomers: 9, withCustomerRecord: 9 });
  }, 120_000);

  it('counts a customer once even with records under two customer schemas, and ignores other entity schemas', () => {
    const events = range(3).map((id) => eventRow(id));
    const entities = [entityRow('cust-1', 'customer'), entityRow('cust-1', 'account'), entityRow('cust-2', 'subscription')];
    expect(coverage(events, entities, ['customer', 'account'])).toEqual({ eventCustomers: 3, withCustomerRecord: 1 });
  }, 120_000);

  it('events with no customer_id do not count, and other environments and projects are out of scope', () => {
    const events = [
      eventRow('cust-1'),
      eventRow(null),
      eventRow(''),
      eventRow('cust-prod', { environmentId: 'env-prod' }),
      eventRow('cust-other', { projectId: 'proj-2' }),
    ];
    expect(coverage(events, [entityRow('cust-1', 'customer', 'env-prod')])).toEqual({ eventCustomers: 1, withCustomerRecord: 0 });
  }, 120_000);

  it('with no customer schema registered, every customer in events is uncovered', () => {
    expect(coverage(range(4).map((id) => eventRow(id)), [entityRow('cust-1')], [])).toEqual({ eventCustomers: 4, withCustomerRecord: 0 });
  }, 120_000);

  it('binds every value as a parameter, never into the SQL text', () => {
    const query = buildCustomerEntityCoverageQuery({ organizationId: "o'1", projectId: PROJECT, environmentId: DEV, customerEntitySchemas: ["cus'tomer"] });
    expect(query.sql).not.toContain("o'1");
    expect(query.sql).not.toContain("cus'tomer");
    expect(query.sql).toContain("LAX_STRING(e.properties['customer_id'])");
    expect(query.params).toMatchObject({ organizationId: "o'1", customerSchema0: "cus'tomer" });
  });
});
