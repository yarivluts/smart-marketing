import { describe, expect, it } from 'vitest';
import { buildMartViewSql, martViewName, UnsafeMartIdentifierError } from './schema-mart';
import type { SchemaFieldDef } from '../models/schema-def.model';

const fields: SchemaFieldDef[] = [
  { name: 'platform', type: 'string', is_required: true, is_pii: false, is_identity_key: false },
  { name: 'spend', type: 'number', is_required: true, is_pii: false, is_identity_key: false },
  { name: 'converted', type: 'boolean', is_required: false, is_pii: false, is_identity_key: false },
  { name: 'date', type: 'timestamp', is_required: true, is_pii: false, is_identity_key: false },
  { name: 'meta', type: 'object', is_required: false, is_pii: false, is_identity_key: false },
];

describe('martViewName', () => {
  it('is deterministic and collision-safe across projects sharing a schema name', () => {
    const a = martViewName('org-1', 'proj-1', 'ad_performance_daily');
    const b = martViewName('org-1', 'proj-2', 'ad_performance_daily');
    expect(a).toBe(martViewName('org-1', 'proj-1', 'ad_performance_daily'));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^m_[0-9a-f]{12}_ad_performance_daily$/);
  });

  it('rejects a schema name that would break the compiler identifier rules', () => {
    expect(() => martViewName('org-1', 'proj-1', 'bad-name')).toThrow(UnsafeMartIdentifierError);
  });
});

describe('buildMartViewSql', () => {
  const sql = buildMartViewSql({ organizationId: 'org-1', projectId: 'proj-1', kind: 'measure', schemaName: 'ad_performance_daily', fieldDefs: fields });

  it('creates-or-replaces the mangled view over stg_raw_records, filtered by kind + schema + tenant', () => {
    expect(sql).toContain(`CREATE OR REPLACE VIEW \`${martViewName('org-1', 'proj-1', 'ad_performance_daily')}\``);
    expect(sql).toContain('FROM `stg_raw_records`');
    expect(sql).toContain("kind = 'measure' AND schema_name = 'ad_performance_daily'");
    expect(sql).toContain("organization_id = 'org-1' AND project_id = 'proj-1'");
  });

  it('keeps the tenant/env/id/time columns so compiler predicates and timeColumn fallbacks keep working', () => {
    for (const column of ['organization_id', 'project_id', 'environment_id', 'client_id', 'landed_at']) {
      expect(sql).toContain(column);
    }
  });

  it('types each declared field per the schema (JSON_VALUE strings, SAFE_CAST numerics/bools/timestamps, JSON_QUERY objects)', () => {
    expect(sql).toContain("JSON_VALUE(payload, '$.platform') AS `platform`");
    expect(sql).toContain("SAFE_CAST(JSON_VALUE(payload, '$.spend') AS FLOAT64) AS `spend`");
    expect(sql).toContain("SAFE_CAST(JSON_VALUE(payload, '$.converted') AS BOOL) AS `converted`");
    expect(sql).toContain("SAFE_CAST(JSON_VALUE(payload, '$.date') AS TIMESTAMP) AS `date`");
    expect(sql).toContain("JSON_QUERY(payload, '$.meta') AS `meta`");
  });

  it('rejects a field name that could smuggle SQL through the JSON path', () => {
    const evil: SchemaFieldDef[] = [{ name: "x') OR 1=1--", type: 'string', is_required: false, is_pii: false, is_identity_key: false }];
    expect(() => buildMartViewSql({ organizationId: 'org-1', projectId: 'proj-1', kind: 'measure', schemaName: 'ok_name', fieldDefs: evil })).toThrow(
      UnsafeMartIdentifierError,
    );
  });
});
