import type {
  OnboardingFunnelStep,
  OnboardingPackKey,
  OnboardingSourceConnectionMethod,
  OnboardingStateModel,
  OnboardingStep,
} from '@growthos/firebase-orm-models';
import type { FunnelStageKey, FunnelStepSuggestion } from '@growthos/shared';

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

/** One row of the wizard's funnel editor: a step to confirm, and whether it is currently part of the funnel. */
export interface FunnelEditorRow {
  eventSchemaName: string;
  stageKey: FunnelStageKey;
  included: boolean;
}

/**
 * The rows the wizard's funnel editor starts from (KAN-199). With no confirmed funnel it is the AI
 * proposal, every step included — the wizard's original behaviour. Once a funnel IS confirmed
 * (in this wizard earlier, or by an agent over MCP `set_funnel`, which writes the same field), the
 * editor starts from that funnel instead, in its own order and stages, followed by every other
 * proposed event schema unticked — so opening the editor never silently replaces a confirmed funnel
 * with a fresh proposal, and the remaining events are still one tick away.
 */
export function buildFunnelEditorRows(
  confirmed: readonly OnboardingFunnelStep[],
  proposal: readonly { eventSchemaName: string; stageKey: FunnelStageKey }[],
): FunnelEditorRow[] {
  if (confirmed.length === 0) {
    return proposal.map((step) => ({ eventSchemaName: step.eventSchemaName, stageKey: step.stageKey, included: true }));
  }
  const ordered = [...confirmed].sort((a, b) => a.order - b.order);
  const confirmedNames = new Set(ordered.map((step) => step.eventSchemaName));
  return [
    ...ordered.map((step) => ({ eventSchemaName: step.eventSchemaName, stageKey: step.stageKey, included: true })),
    ...proposal
      .filter((step) => !confirmedNames.has(step.eventSchemaName))
      .map((step) => ({ eventSchemaName: step.eventSchemaName, stageKey: step.stageKey, included: false })),
  ];
}
