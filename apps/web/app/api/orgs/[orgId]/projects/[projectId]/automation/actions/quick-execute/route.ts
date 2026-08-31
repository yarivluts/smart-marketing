import { NextResponse, type NextRequest } from 'next/server';
import {
  AutomationActionInvalidStateError,
  AutomationActionNotFoundError,
  AutomationKillSwitchEngagedError,
  AutomationTargetNotFoundError,
  AutomationTargetStateModel,
  AutomationActionModel,
  GoogleAdsCredentialConfigError,
  GoogleAdsPluginNotInstalledError,
  MetaAdsCredentialConfigError,
  MetaPluginNotInstalledError,
  InsufficientWriteTierError,
  InvalidAutomationActionError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import {
  proposeAutomationBudgetChangeAction,
  proposeCampaignActivationAction,
  approveAutomationAction,
  executeAutomationAction,
  rollbackAutomationAction,
} from '@/lib/orgs/mutations';
import { listAutomationActionsForProject } from '@/lib/orgs/queries';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export interface QuickExecuteRequestBody {
  targetId: string;
  actionType: 'budget_change' | 'campaign_activation' | 'campaign_pause';
  afterDailyBudgetUsd?: number;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<Partial<QuickExecuteRequestBody>>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { targetId, actionType, afterDailyBudgetUsd } = parsed.body;
  if (!targetId || typeof targetId !== 'string' || targetId.trim().length === 0) {
    return NextResponse.json({ error: 'target_id_required' }, { status: 400 });
  }

  if (!actionType || !['budget_change', 'campaign_activation', 'campaign_pause'].includes(actionType)) {
    return NextResponse.json({ error: 'invalid_action_type' }, { status: 400 });
  }

  let kms;
  try {
    kms = getServerKmsProvider();
  } catch (err) {
    if (!(err instanceof VaultNotConfiguredError)) {
      throw err;
    }
  }

  try {
    if (actionType === 'budget_change') {
      if (typeof afterDailyBudgetUsd !== 'number' || afterDailyBudgetUsd <= 0) {
        return NextResponse.json({ error: 'after_daily_budget_usd_required' }, { status: 400 });
      }

      const proposed = await proposeAutomationBudgetChangeAction({
        organizationId: orgId,
        projectId,
        targetId,
        afterDailyBudgetUsd,
        requestedByUserId: user.id,
      });

      if (proposed.status === 'blocked') {
        return NextResponse.json(
          {
            error: 'guardrail_blocked',
            violations: proposed.guardrail_violations,
            actionId: proposed.id,
          },
          { status: 422 },
        );
      }

      await approveAutomationAction(orgId, projectId, proposed.id, user.id);
      const executed = await executeAutomationAction(orgId, projectId, proposed.id, user.id, kms);

      return NextResponse.json({
        id: executed.id,
        status: executed.status,
        targetId,
        before: executed.before,
        after: executed.after,
      });
    }

    if (actionType === 'campaign_activation') {
      const proposed = await proposeCampaignActivationAction({
        organizationId: orgId,
        projectId,
        targetId,
        requestedByUserId: user.id,
      });

      if (proposed.status === 'blocked') {
        return NextResponse.json(
          {
            error: 'guardrail_blocked',
            violations: proposed.guardrail_violations,
            actionId: proposed.id,
          },
          { status: 422 },
        );
      }

      await approveAutomationAction(orgId, projectId, proposed.id, user.id);
      const executed = await executeAutomationAction(orgId, projectId, proposed.id, user.id, kms);

      return NextResponse.json({
        id: executed.id,
        status: executed.status,
        targetId,
        before: executed.before,
        after: executed.after,
      });
    }

    if (actionType === 'campaign_pause') {
      const actions = await listAutomationActionsForProject(orgId, projectId);
      const activeActivation = actions.find(
        (a) =>
          a.target_id === targetId &&
          a.action_type === 'campaign_activation' &&
          (a.status === 'executed' || a.status === 'verified'),
      );

      if (activeActivation) {
        const rolledBack = await rollbackAutomationAction(orgId, projectId, activeActivation.id, user.id, kms);
        return NextResponse.json({
          id: rolledBack.id,
          status: 'executed',
          targetId,
          before: { status: 'enabled' },
          after: { status: 'paused' },
        });
      }

      // If no active activation action exists to rollback, mutate the target state directly and record an action
      const loaded = await AutomationTargetStateModel.init(targetId, { organization_id: orgId, project_id: projectId });
      if (!loaded || loaded.project_id !== projectId) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }

      loaded.campaign_status = 'paused';
      loaded.updated_at = new Date().toISOString();
      await loaded.save();

      const action = new AutomationActionModel();
      action.organization_id = orgId;
      action.project_id = projectId;
      action.environment_id = loaded.environment_id;
      action.action_type = 'campaign_activation';
      action.target_id = targetId;
      action.target_label = loaded.label;
      action.before = { status: 'enabled' };
      action.after = { status: 'paused' };
      action.status = 'rolled_back';
      action.guardrail_violations = [];
      action.requested_by_user_id = user.id;
      action.proposed_at = new Date().toISOString();
      action.rolled_back_at = new Date().toISOString();
      action.rolled_back_by_user_id = user.id;
      action.rollback_reason = 'manual';
      action.setPathParams({ organization_id: orgId, project_id: projectId });
      await action.save();

      return NextResponse.json({
        id: action.id,
        status: 'executed',
        targetId,
        before: { status: 'enabled' },
        after: { status: 'paused' },
      });
    }

    return NextResponse.json({ error: 'invalid_action_type' }, { status: 400 });
  } catch (err) {
    if (
      err instanceof ProjectNotFoundError ||
      err instanceof AutomationActionNotFoundError ||
      err instanceof AutomationTargetNotFoundError
    ) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof AutomationActionInvalidStateError) {
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
    }
    if (err instanceof AutomationKillSwitchEngagedError) {
      return NextResponse.json({ error: 'kill_switch_engaged' }, { status: 409 });
    }
    if (err instanceof InsufficientWriteTierError) {
      return NextResponse.json({ error: 'insufficient_write_tier' }, { status: 409 });
    }
    if (err instanceof GoogleAdsPluginNotInstalledError) {
      return NextResponse.json({ error: 'google_ads_plugin_not_installed' }, { status: 409 });
    }
    if (err instanceof GoogleAdsCredentialConfigError) {
      return NextResponse.json({ error: 'google_ads_credential_not_configured', reason: err.reason }, { status: 409 });
    }
    if (err instanceof MetaPluginNotInstalledError) {
      return NextResponse.json({ error: 'meta_plugin_not_installed' }, { status: 409 });
    }
    if (err instanceof MetaAdsCredentialConfigError) {
      return NextResponse.json({ error: 'meta_ads_credential_not_configured', reason: err.reason }, { status: 409 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_action', message: err.message }, { status: 400 });
    }
    throw err;
  }
}
