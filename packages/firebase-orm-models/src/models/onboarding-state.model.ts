import { BaseModel, Field, Model } from '@arbel/firebase-orm';
import type { FunnelStageKey } from '@growthos/shared';

/**
 * The onboarding wizard's own step sequence (KAN-68, plan `10 §2.6`/`13 §E13.1`): pick a vertical/
 * metric pack, connect a first source (or push-your-own), confirm an AI-proposed funnel mapping, land
 * on the starter board the pack seeded. Plan step 5 ("invite team + set a goal + turn on the war
 * room") has no state of its own to persist — every one of those actions lives on its own existing
 * surface (KAN-25/64/67) — so it's folded into the `board` step's own final screen (starter board
 * links plus those three CTAs) rather than getting a dedicated step value with nothing to record.
 * `done` is the terminal step once a human explicitly completes the wizard — nothing in this codebase
 * enforces the steps run in this exact order (see `onboarding.service.ts`'s own doc comment), so `step`
 * is best read as "furthest step reached", not a hard state-machine gate.
 */
export const ONBOARDING_STEPS = ['pack', 'sources', 'funnel', 'board', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** The built-in metric packs the wizard's "pick a vertical" step offers, plus `custom` (skip installing any pack — plan `10 §2.6`'s own "or custom/hybrid"). */
export const ONBOARDING_PACK_KEYS = ['saas_marketing', 'engagement', 'custom'] as const;
export type OnboardingPackKey = (typeof ONBOARDING_PACK_KEYS)[number];

export function isOnboardingPackKey(value: string): value is OnboardingPackKey {
  return (ONBOARDING_PACK_KEYS as readonly string[]).includes(value);
}

/** How the wizard's "connect a first source" step was resolved — a real source plugin install, or the "push your own data" curl+key path (plan `10 §2.6` step 2). */
export const ONBOARDING_SOURCE_CONNECTION_METHODS = ['plugin', 'push_your_own'] as const;
export type OnboardingSourceConnectionMethod = (typeof ONBOARDING_SOURCE_CONNECTION_METHODS)[number];

export function isOnboardingSourceConnectionMethod(value: string): value is OnboardingSourceConnectionMethod {
  return (ONBOARDING_SOURCE_CONNECTION_METHODS as readonly string[]).includes(value);
}

/** One step of the funnel the human confirmed from `proposeFunnelSteps`'s (KAN-68 AC) AI-proposed ordering — embedded on {@link OnboardingStateModel} rather than a separate collection, the same "small array of nested config, always read/written together" shape `BoardModel.tiles` already uses. */
export interface OnboardingFunnelStep {
  eventSchemaName: string;
  stageKey: FunnelStageKey;
  order: number;
}

/**
 * A project's onboarding-wizard progress (KAN-68, plan `13 §E13.1`: "New tenant reaches populated
 * board < 30 min (measured)"). One mutable singleton document per project — `onboarding.service.ts`'s
 * `getOrCreateOnboardingState` looks it up by `project_id` rather than a well-known fixed id, the same
 * query-and-take-first pattern `getProjectCostQuota`/`getLatestPluginManifestVersion` already use for
 * their own "effectively one config per project" lookups. `started_at` and `completed_at` are what let
 * the AC's own "< 30 min" measurement be computed later, without a separate analytics pipeline.
 */
@Model({
  reference_path: 'organizations/:organization_id/projects/:project_id/onboarding_states',
  path_id: 'onboarding_state_id',
})
export class OnboardingStateModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public project_id!: string;

  @Field({ is_required: true })
  public step!: OnboardingStep;

  /** `null` until the "pick a pack" step is completed. Explicit `null` (not `undefined`) for the same reason `BoardModel.compare` is — see that field's own doc comment on `updateDoc()` silently ignoring `undefined`. */
  @Field({ is_required: false })
  public selected_pack_key!: OnboardingPackKey | null;

  /** The built-in pack's own plugin id, once installed — `null` for `selected_pack_key: 'custom'` (no pack installed) or before this step runs. */
  @Field({ is_required: false })
  public selected_plugin_id!: string | null;

  @Field({ is_required: false })
  public source_connection_method!: OnboardingSourceConnectionMethod | null;

  /** The installed source plugin's own id, when `source_connection_method` is `'plugin'` — `null` for `'push_your_own'` or before this step runs. */
  @Field({ is_required: false })
  public connected_source_plugin_id!: string | null;

  @Field({ is_required: true })
  public funnel_steps!: OnboardingFunnelStep[];

  @Field({ is_required: true })
  public started_by!: string;

  @Field({ is_required: true })
  public started_at!: string;

  /** `null` until a human explicitly finishes the wizard (the "invite + goal + war room" step's own completion action). */
  @Field({ is_required: false })
  public completed_at!: string | null;

  @Field({ is_required: true })
  public updated_at!: string;
}
