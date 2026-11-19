import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'schemaFilterAll',
  'kpiSchemas',
  'kpiPiiFields',
  'promptDetail',
  'emptyDetail',
  'breakdownDescription',
  'piiField',
  'schemasTitle',
  'schemaPiiSublabel',
] as const;

describe('customer search speaks plainly', () => {
  it('English avoids schema / entity / PII jargon', () => {
    for (const key of KEYS) {
      expect(en.Customers[key]).not.toMatch(/schema|entity|entities|\bPII\b/i);
    }
  });

  it('Hebrew avoids סכמה / סכמות / ישויות / מידע אישי jargon', () => {
    for (const key of KEYS) {
      expect(he.Customers[key]).not.toMatch(/סכמ|סכימ|ישויות|ישות|מידע אישי/);
    }
  });

  it('the personal-field count keeps its plural forms', () => {
    expect(en.Customers.schemaPiiSublabel).toContain('one {# personal field}');
    expect(he.Customers.schemaPiiSublabel).toContain('one {שדה אישי אחד}');
  });
});
