import { describe, expect, it } from 'vitest';
import { DEMO_EVENT_SCHEMA_FIELDS, DEMO_EVENT_SCHEMA_KIND, DEMO_EVENT_SCHEMA_NAME, DEMO_EVENT_STAGES } from './demo-schema';

describe('demo event schema', () => {
  it('registers as an event schema named demo_event', () => {
    expect(DEMO_EVENT_SCHEMA_KIND).toBe('event');
    expect(DEMO_EVENT_SCHEMA_NAME).toBe('demo_event');
  });

  it('has exactly four recognized lifecycle stages', () => {
    expect(DEMO_EVENT_STAGES).toEqual(['scheduled', 'held', 'no_show', 'canceled']);
  });

  it('requires demo_id and stage, none of the fields flagged PII or identity keys', () => {
    const byName = Object.fromEntries(DEMO_EVENT_SCHEMA_FIELDS.map((field) => [field.name, field]));
    expect(byName.demo_id).toMatchObject({ type: 'string', isRequired: true });
    expect(byName.stage).toMatchObject({ type: 'string', isRequired: true });
    expect(byName.rep_org_person_id).toMatchObject({ type: 'string', isRequired: false });
    expect(byName.account_name).toMatchObject({ type: 'string', isRequired: false });
    expect(DEMO_EVENT_SCHEMA_FIELDS.every((field) => !field.isPii && !field.isIdentityKey)).toBe(true);
  });
});
