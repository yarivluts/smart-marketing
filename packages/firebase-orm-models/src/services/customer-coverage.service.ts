import type { CompiledMetricQuery, SetupCustomerCoverage } from '@growthos/shared';
import { defaultWarehouseQueryExecutor, WarehouseNotConfiguredError, WarehouseQueryFailedError, type WarehouseQueryExecutor, type WarehouseSqlDialect } from '../warehouse/query-executor';
import { ProjectQueryQuotaExceededError, runQuotaGatedWarehouseQuery } from './cost-guardrail.service';
import { jsonTextField } from './mcp-tools.service';

export interface GetCustomerEntityCoverageParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
  /**
   * The entity schemas that count as a customer record (the ones setup health maps to the customer
   * entity requirement). Empty: no customer schema exists, so every customer in events is uncovered.
   */
  customerEntitySchemas: readonly string[];
  executor?: WarehouseQueryExecutor;
}

export type CustomerEntityCoverageResult =
  | { status: 'ok'; coverage: SetupCustomerCoverage }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

/**
 * The coverage SQL: distinct `properties.customer_id` in the environment's events, and how many of
 * them have a row in `entities` under one of the customer schemas. Both sides are de-duplicated
 * first, so a customer with records under two schemas is still one customer. Every row in `events`
 * was accepted (quarantined records never land), so no status filter is needed.
 */
export function buildCustomerEntityCoverageQuery(params: Omit<GetCustomerEntityCoverageParams, 'executor'>, dialect: WarehouseSqlDialect = 'bigquery'): CompiledMetricQuery {
  const customerId = jsonTextField(dialect, 'e.properties', 'customer_id');
  const queryParams: Record<string, string> = {
    organizationId: params.organizationId,
    projectId: params.projectId,
    environmentId: params.environmentId,
  };
  const schemaPlaceholders = params.customerEntitySchemas.map((name, index) => {
    queryParams[`customerSchema${index}`] = name;
    return `@customerSchema${index}`;
  });
  const schemaFilter = schemaPlaceholders.length > 0 ? `en.schema_name IN (${schemaPlaceholders.join(', ')})` : '1 = 0';
  const scope = (alias: string) => `${alias}.organization_id = @organizationId AND ${alias}.project_id = @projectId AND ${alias}.environment_id = @environmentId`;
  const sql = [
    'WITH event_customers AS (',
    `  SELECT DISTINCT ${customerId} AS customer_id FROM events e`,
    `  WHERE ${scope('e')} AND ${customerId} IS NOT NULL AND ${customerId} <> ''`,
    '), customer_records AS (',
    '  SELECT DISTINCT en.entity_id FROM entities en',
    `  WHERE ${scope('en')} AND ${schemaFilter}`,
    ')',
    'SELECT COUNT(*) AS event_customers, COUNT(customer_records.entity_id) AS with_customer_record',
    'FROM event_customers LEFT JOIN customer_records ON customer_records.entity_id = event_customers.customer_id',
  ].join('\n');
  return { sql, params: queryParams };
}

/**
 * How many of the customers this environment's events name also have a customer entity record
 * (setup health's customer-backfill recommendation). Read from the warehouse core tables, so it is
 * as current as their last refresh. Behind the same cost guardrail as every other hand-written
 * warehouse read; an unconfigured warehouse, a failed query or an exhausted quota each come back as
 * a state rather than a throw, and the recommendation then falls back to what ingest alone shows.
 */
export async function getCustomerEntityCoverage(params: GetCustomerEntityCoverageParams): Promise<CustomerEntityCoverageResult> {
  const executor = params.executor ?? defaultWarehouseQueryExecutor;
  const query = buildCustomerEntityCoverageQuery(params, executor.dialect ?? 'bigquery');
  try {
    const [row] = await runQuotaGatedWarehouseQuery(params.organizationId, params.projectId, { tool: 'customer_entity_coverage' }, () => executor.execute(query));
    return {
      status: 'ok',
      coverage: { eventCustomers: Number(row?.event_customers ?? 0), withCustomerRecord: Number(row?.with_customer_record ?? 0) },
    };
  } catch (error) {
    if (error instanceof WarehouseNotConfiguredError) {
      return { status: 'not_configured' };
    }
    if (error instanceof ProjectQueryQuotaExceededError || error instanceof WarehouseQueryFailedError) {
      return { status: 'error', message: error.message };
    }
    throw error;
  }
}
