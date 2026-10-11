import { describe, expect, it } from 'vitest';
import type { OnboardingStateModel } from '@growthos/firebase-orm-models';
import { buildFunnelEditorRows, toOnboardingStateView } from './onboarding-view';

function state(overrides: Partial<OnboardingStateModel> & Pick<OnboardingStateModel, 'id'>): OnboardingStateModel {
  return {
    step: 'pack',
    selected_pack_key: null,
    selected_plugin_id: null,
    source_connection_method: null,
    connected_source_plugin_id: null,
    funnel_steps: [],
    started_at: '2026-07-12T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  } as OnboardingStateModel;
}

describe('toOnboardingStateView', () => {
  it('maps a fresh wizard state', () => {
    expect(toOnboardingStateView(state({ id: 'state-1' }))).toEqual({
      step: 'pack',
      selectedPackKey: null,
      selectedPluginId: null,
      sourceConnectionMethod: null,
      connectedSourcePluginId: null,
      funnelSteps: [],
      startedAt: '2026-07-12T00:00:00.000Z',
      completedAt: null,
    });
  });

  it('maps a fully progressed, completed wizard state', () => {
    const view = toOnboardingStateView(
      state({
        id: 'state-2',
        step: 'done',
        selected_pack_key: 'saas_marketing',
        selected_plugin_id: 'com.growthos.saas-marketing-metrics',
        source_connection_method: 'plugin',
        connected_source_plugin_id: 'com.growthos.stripe',
        funnel_steps: [{ eventSchemaName: 'user_signed_up', stageKey: 'signup', order: 0 }],
        completed_at: '2026-07-12T00:10:00.000Z',
      }),
    );
    expect(view).toEqual({
      step: 'done',
      selectedPackKey: 'saas_marketing',
      selectedPluginId: 'com.growthos.saas-marketing-metrics',
      sourceConnectionMethod: 'plugin',
      connectedSourcePluginId: 'com.growthos.stripe',
      funnelSteps: [{ eventSchemaName: 'user_signed_up', stageKey: 'signup', order: 0 }],
      startedAt: '2026-07-12T00:00:00.000Z',
      completedAt: '2026-07-12T00:10:00.000Z',
    });
  });
});

describe('buildFunnelEditorRows (KAN-199)', () => {
  const PROPOSAL = [
    { eventSchemaName: 'page_viewed', stageKey: 'awareness' as const },
    { eventSchemaName: 'signup', stageKey: 'signup' as const },
    { eventSchemaName: 'document_signed', stageKey: 'other' as const },
  ];

  it('is the proposal, every step included, when no funnel is confirmed', () => {
    expect(buildFunnelEditorRows([], PROPOSAL)).toEqual([
      { eventSchemaName: 'page_viewed', stageKey: 'awareness', included: true },
      { eventSchemaName: 'signup', stageKey: 'signup', included: true },
      { eventSchemaName: 'document_signed', stageKey: 'other', included: true },
    ]);
  });

  it('starts from a confirmed funnel (e.g. one set over MCP) in its own order and stages, then the rest of the proposal unticked', () => {
    const confirmed = [
      { eventSchemaName: 'document_signed', stageKey: 'conversion' as const, order: 1 },
      { eventSchemaName: 'signup', stageKey: 'signup' as const, order: 0 },
    ];
    expect(buildFunnelEditorRows(confirmed, PROPOSAL)).toEqual([
      { eventSchemaName: 'signup', stageKey: 'signup', included: true },
      { eventSchemaName: 'document_signed', stageKey: 'conversion', included: true },
      { eventSchemaName: 'page_viewed', stageKey: 'awareness', included: false },
    ]);
  });

  it('keeps a confirmed step even if the proposal no longer lists it', () => {
    const confirmed = [
      { eventSchemaName: 'legacy_event', stageKey: 'other' as const, order: 0 },
      { eventSchemaName: 'signup', stageKey: 'signup' as const, order: 1 },
    ];
    expect(buildFunnelEditorRows(confirmed, PROPOSAL).map((row) => [row.eventSchemaName, row.included])).toEqual([
      ['legacy_event', true],
      ['signup', true],
      ['page_viewed', false],
      ['document_signed', false],
    ]);
  });
});
