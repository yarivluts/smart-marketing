import { describe, expect, it } from 'vitest';
import { SUPPORT_TICKET_SCHEMA_FIELDS, SUPPORT_TICKET_SCHEMA_KIND, SUPPORT_TICKET_SCHEMA_NAME, SUPPORT_TICKET_STAGES } from './support-ticket-schema';

describe('support ticket schema', () => {
  it('registers as an event schema named support_ticket_event', () => {
    expect(SUPPORT_TICKET_SCHEMA_KIND).toBe('event');
    expect(SUPPORT_TICKET_SCHEMA_NAME).toBe('support_ticket_event');
  });

  it('has exactly two recognized lifecycle stages', () => {
    expect(SUPPORT_TICKET_STAGES).toEqual(['opened', 'resolved']);
  });

  it('requires ticket_id and stage, none of the fields flagged PII or identity keys', () => {
    const byName = Object.fromEntries(SUPPORT_TICKET_SCHEMA_FIELDS.map((field) => [field.name, field]));
    expect(byName.ticket_id).toMatchObject({ type: 'string', isRequired: true });
    expect(byName.stage).toMatchObject({ type: 'string', isRequired: true });
    expect(byName.agent_org_person_id).toMatchObject({ type: 'string', isRequired: false });
    expect(byName.first_response_seconds).toMatchObject({ type: 'number', isRequired: false });
    expect(byName.resolution_seconds).toMatchObject({ type: 'number', isRequired: false });
    expect(byName.csat_score).toMatchObject({ type: 'number', isRequired: false });
    expect(SUPPORT_TICKET_SCHEMA_FIELDS.every((field) => !field.isPii && !field.isIdentityKey)).toBe(true);
  });
});
