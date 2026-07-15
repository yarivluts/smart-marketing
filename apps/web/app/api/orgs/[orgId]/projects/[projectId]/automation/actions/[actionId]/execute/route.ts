import { NextResponse, type NextRequest } from 'next/server';
import {
  AutomationActionInvalidStateError,
  AutomationActionNotFoundError,
  AutomationKillSwitchEngagedError,
  AutomationTargetNotFoundError,
  GoogleAdsCredentialConfigError,
  GoogleAdsPluginNotInstalledError,
  MetaAdsCredentialConfigError,
  MetaPluginNotInstalledError,
  InsufficientWriteTierError,
  InvalidAutomationActionError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { executeAutomationAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; actionId: string }>;
}

/**
 * Executes an `approved` action (KAN-71's execute step) — always returns
 * 200 with the action's resulting status even when the executor itself
 * failed, since `executeAutomationAction` already turns a failure into a
 * terminal `failed` status rather than throwing (retries are exhausted
 * inside the service call). KAN-72: resolves a real
 * `GoogleAdsAutomationActionExecutor` when the target is linked to an
 * installed Google Ads Manage connection, otherwise the simulated executor
 * every target used before this story. KAN-73: the same resolution for a
 * `MetaAutomationActionExecutor` under the parallel Meta Manage connection
 * condition — see `resolveAutomationActionExecutorForTarget`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, actionId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  // Only a target linked to a real (e.g. Google Ads) connection ever consults this — resolved
  // best-effort so a deployment without the vault configured (KAN-18) doesn't break execution for
  // every simulated target, the same posture the plugins/[installId]/run route already uses.
  let kms;
  try {
    kms = getServerKmsProvider();
  } catch (err) {
    if (!(err instanceof VaultNotConfiguredError)) {
      throw err;
    }
  }

  try {
    const action = await executeAutomationAction(orgId, projectId, actionId, user.id, kms);
    return NextResponse.json({ id: action.id, status: action.status, failureReason: action.failure_reason });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationActionNotFoundError || err instanceof AutomationTargetNotFoundError) {
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
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }
    throw err;
  }
}
