import { NextResponse, type NextRequest } from 'next/server';
import {
  AutomationActionInvalidStateError,
  AutomationActionNotFoundError,
  AutomationTargetNotFoundError,
  GoogleAdsCredentialConfigError,
  GoogleAdsPluginNotInstalledError,
  MetaAdsCredentialConfigError,
  MetaPluginNotInstalledError,
  InvalidAutomationActionError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { rollbackAutomationAction } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; actionId: string }>;
}

/** Manually rolls back an `executed` or `verified` action (KAN-71's rollback step) — restores the target to its pre-action state. KAN-72: resolves the same real-vs-simulated executor `execute` does. */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, actionId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
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
    const action = await rollbackAutomationAction(orgId, projectId, actionId, user.id, kms);
    return NextResponse.json({ id: action.id, status: action.status });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationActionNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof AutomationActionInvalidStateError) {
      return NextResponse.json({ error: 'invalid_state' }, { status: 409 });
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
