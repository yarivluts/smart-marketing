import { describe, expect, it } from 'vitest';
import { FIRMOGRAPHIC_SCHEMA_FIELDS, FIRMOGRAPHIC_SCHEMA_KIND, FIRMOGRAPHIC_SCHEMA_NAME } from './firmographic-schema';

describe('firmographic schema', () => {
  it('registers as an event schema named company_firmographic', () => {
    expect(FIRMOGRAPHIC_SCHEMA_KIND).toBe('event');
    expect(FIRMOGRAPHIC_SCHEMA_NAME).toBe('company_firmographic');
  });

  it('requires company_name/employee_count_range/region/industry but not company_domain, and flags none as PII', () => {
    const byName = Object.fromEntries(FIRMOGRAPHIC_SCHEMA_FIELDS.map((field) => [field.name, field]));
    expect(byName.company_name).toMatchObject({ type: 'string', isRequired: true, isPii: false, isIdentityKey: false });
    expect(byName.company_domain).toMatchObject({ type: 'string', isRequired: false, isPii: false, isIdentityKey: false });
    expect(byName.employee_count_range).toMatchObject({ type: 'string', isRequired: true, isPii: false, isIdentityKey: false });
    expect(byName.region).toMatchObject({ type: 'string', isRequired: true, isPii: false, isIdentityKey: false });
    expect(byName.industry).toMatchObject({ type: 'string', isRequired: true, isPii: false, isIdentityKey: false });
  });
});
