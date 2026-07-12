import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * One engage/disengage event of an org's "pause all automation" kill switch
 * (KAN-71, plan `06 §7`: "Kill switch: global + per-tenant"). Per-tenant here
 * means per-organization — the scope every other guardrail/quota config in
 * this codebase already anchors to (`ProjectCostQuotaModel`,
 * `AutomationGuardrailPolicyModel`) one level down at the project. A
 * platform-wide (cross-tenant) switch is deferred: there is no platform-level
 * admin surface anywhere in this app yet for a human to operate one (see
 * PROGRESS.md).
 *
 * Append-only event log rather than a single mutable flag — the same
 * "current = newest" convention as the guardrail policy above —so the
 * engage/disengage history (who, when, why) stays inspectable without a
 * separate audit-log lookup. `getAutomationKillSwitchStatus` derives the
 * effective state as the newest event's own `engaged` value.
 */
@Model({
  reference_path: 'organizations/:organization_id/automation_kill_switch_events',
  path_id: 'automation_kill_switch_event_id',
})
export class AutomationKillSwitchEventModel extends BaseModel {
  @Field({ is_required: true })
  public organization_id!: string;

  @Field({ is_required: true })
  public engaged!: boolean;

  /** Why the switch was flipped — required when engaging (an emergency stop should always say why), optional when disengaging. */
  @Field({ is_required: false })
  public reason?: string;

  @Field({ is_required: true })
  public actor_id!: string;

  @Field({ is_required: true })
  public created_at!: string;
}
