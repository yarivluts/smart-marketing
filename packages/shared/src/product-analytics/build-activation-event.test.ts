import { describe, expect, it } from 'vitest';
import { buildActivationEventPayload } from './build-activation-event';

describe('buildActivationEventPayload', () => {
  it('builds the required fields for a bare funnel step', () => {
    const payload = buildActivationEventPayload({
      eventId: 'evt_1',
      ts: '2026-07-12T09:00:00.000Z',
      funnelStep: 'onboarding_started',
      targetOrganizationId: 'org_1',
      targetProjectId: 'proj_1',
    });

    expect(payload.event_id).toBe('evt_1');
    expect(payload.event).toBe('growthos_activation');
    expect(payload.properties).toEqual({
      funnel_step: 'onboarding_started',
      target_organization_id: 'org_1',
      target_project_id: 'proj_1',
    });
  });

  it('includes optional fields only when supplied', () => {
    const payload = buildActivationEventPayload({
      eventId: 'evt_2',
      ts: '2026-07-12T09:05:00.000Z',
      funnelStep: 'pack_selected',
      targetOrganizationId: 'org_1',
      targetProjectId: 'proj_1',
      packKey: 'saas_marketing',
    });

    expect(payload.properties).toEqual({
      funnel_step: 'pack_selected',
      target_organization_id: 'org_1',
      target_project_id: 'proj_1',
      pack_key: 'saas_marketing',
    });
    expect('source_connection_method' in payload.properties).toBe(false);
    expect('funnel_step_count' in payload.properties).toBe(false);
  });

  it('never reuses the same event id across two funnel steps, so they never collide on ingest dedup', () => {
    const first = buildActivationEventPayload({
      eventId: 'evt_1',
      ts: 't1',
      funnelStep: 'onboarding_started',
      targetOrganizationId: 'org_1',
      targetProjectId: 'proj_1',
    });
    const second = buildActivationEventPayload({
      eventId: 'evt_2',
      ts: 't2',
      funnelStep: 'onboarding_completed',
      targetOrganizationId: 'org_1',
      targetProjectId: 'proj_1',
    });
    expect(first.event_id).not.toBe(second.event_id);
  });
});
