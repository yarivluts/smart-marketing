import type {
  OnboardingFunnelStep,
  OnboardingPackKey,
  OnboardingSourceConnectionMethod,
  OnboardingStateModel,
  OnboardingStep,
} from '@growthos/firebase-orm-models';
import type { FunnelStepSuggestion } from '@growthos/shared';

/**
 * A plain, serializable projection of a project's onboarding-wizard state
 * (KAN-68). Client components can only ever receive plain data across the
 * RSC boundary, never an `@arbel/firebase-orm` model instance — same
 * reasoning as `toPluginManifestView`.
 */
export interface OnboardingStateView {
  step: OnboardingStep;
  selectedPackKey: OnboardingPackKey | null;
  selectedPluginId: string | null;
  sourceConnectionMethod: OnboardingSourceConnectionMethod | null;
  connectedSourcePluginId: string | null;
  funnelSteps: OnboardingFunnelStep[];
  startedAt: string;
  completedAt: string | null;
}

export function toOnboardingStateView(state: OnboardingStateModel): OnboardingStateView {
  return {
    step: state.step,
    selectedPackKey: state.selected_pack_key,
    selectedPluginId: state.selected_plugin_id,
    sourceConnectionMethod: state.source_connection_method,
    connectedSourcePluginId: state.connected_source_plugin_id,
    funnelSteps: state.funnel_steps,
    startedAt: state.started_at,
    completedAt: state.completed_at,
  };
}

export type FunnelStepSuggestionView = FunnelStepSuggestion;
