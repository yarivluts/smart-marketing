import { AutomationKillSwitchEventModel } from '../models/automation-kill-switch-event.model';
import { OrganizationModel } from '../models/organization.model';
import { recordAuditLogEntry } from './audit-log.service';

export class OrganizationNotFoundError extends Error {
  constructor() {
    super('Organization not found.');
    this.name = 'OrganizationNotFoundError';
  }
}

async function requireOrganization(organizationId: string): Promise<void> {
  const org = await OrganizationModel.init(organizationId);
  if (!org) {
    throw new OrganizationNotFoundError();
  }
}

export interface AutomationKillSwitchStatus {
  engaged: boolean;
  engagedAt?: string;
  engagedByUserId?: string;
  reason?: string;
}

/** The org's current "pause all automation" state (KAN-71's kill switch AC) — the newest engage/disengage event, or disengaged if none has ever been recorded. */
export async function getAutomationKillSwitchStatus(organizationId: string): Promise<AutomationKillSwitchStatus> {
  await requireOrganization(organizationId);
  const [latest] = await AutomationKillSwitchEventModel.initPath({ organization_id: organizationId })
    .query()
    .orderBy('created_at', 'desc')
    .limit(1)
    .get();

  if (!latest || !latest.engaged) {
    return { engaged: false };
  }
  return {
    engaged: true,
    engagedAt: latest.created_at,
    engagedByUserId: latest.actor_id,
    ...(latest.reason !== undefined ? { reason: latest.reason } : {}),
  };
}

/** Convenience boolean for the pipeline's own pre-approve/pre-execute gate — avoids every call site re-destructuring `.engaged`. */
export async function isAutomationKillSwitchEngaged(organizationId: string): Promise<boolean> {
  return (await getAutomationKillSwitchStatus(organizationId)).engaged;
}

async function recordKillSwitchEvent(organizationId: string, engaged: boolean, actorId: string, reason?: string): Promise<AutomationKillSwitchEventModel> {
  const event = new AutomationKillSwitchEventModel();
  event.organization_id = organizationId;
  event.engaged = engaged;
  if (reason !== undefined) event.reason = reason;
  event.actor_id = actorId;
  event.created_at = new Date().toISOString();
  event.setPathParams({ organization_id: organizationId });
  await event.save();
  return event;
}

export interface EngageAutomationKillSwitchParams {
  organizationId: string;
  reason: string;
  actorId: string;
}

/** Pauses every Manage-tier automation action (proposal, approval, and execution) for the whole org until {@link disengageAutomationKillSwitch} is called — the emergency stop KAN-71's AC calls for. */
export async function engageAutomationKillSwitch(params: EngageAutomationKillSwitchParams): Promise<AutomationKillSwitchStatus> {
  await requireOrganization(params.organizationId);
  await recordKillSwitchEvent(params.organizationId, true, params.actorId, params.reason);

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'automation_kill_switch.engage',
      targetType: 'organization',
      targetId: params.organizationId,
      summary: `Engaged the automation kill switch: ${params.reason}`,
      after: { engaged: true, reason: params.reason },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return { engaged: true, reason: params.reason, engagedByUserId: params.actorId };
}

export interface DisengageAutomationKillSwitchParams {
  organizationId: string;
  actorId: string;
}

export async function disengageAutomationKillSwitch(params: DisengageAutomationKillSwitchParams): Promise<AutomationKillSwitchStatus> {
  await requireOrganization(params.organizationId);
  await recordKillSwitchEvent(params.organizationId, false, params.actorId);

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      actorType: 'user',
      actorId: params.actorId,
      action: 'automation_kill_switch.disengage',
      targetType: 'organization',
      targetId: params.organizationId,
      summary: 'Disengaged the automation kill switch',
      after: { engaged: false },
    });
  } catch {
    // Best-effort — see recordAuditLogEntry's own doc comment.
  }

  return { engaged: false };
}
