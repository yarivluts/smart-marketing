import { describe, expect, it } from 'vitest';
import type { OnboardingStateModel } from '@growthos/firebase-orm-models';
import { toOnboardingStateView } from './onboarding-view';

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
