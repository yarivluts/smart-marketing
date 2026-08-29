import { NextResponse, type NextRequest } from 'next/server';
import {
  AutomationTargetNotFoundError,
  GoogleAdsApiError,
  GoogleAdsCredentialConfigError,
  GoogleAdsPluginNotInstalledError,
  MetaAdsApiError,
  MetaAdsCredentialConfigError,
  MetaPluginNotInstalledError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { refreshAutomationTargetState } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; targetId: string }>;
}

/**
 * The read seam's route (KAN-43 groundwork): re-reads one campaign's state as
 * the ad platform itself reports it right now, via the target's own
 * provider-resolved executor — pure observation, so it needs no
 * propose/approve cycle (see `AutomationActionExecutor.readCampaignState`'s
 * own doc comment for the legality reasoning). Same permission gate + KMS
 * resolution + error-mapping shape as the sibling `execute` route.
 */
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, targetId: rawTargetId } = await params;
  const targetId = decodeURIComponent(rawTargetId);
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  // Best-effort KMS resolution — same "a deployment without the vault must not break simulated targets" posture as the execute route.
  let kms;
  try {
    kms = getServerKmsProvider();
  } catch (err) {
    if (!(err instanceof VaultNotConfiguredError)) {
      throw err;
    }
  }

  try {
    const target = await refreshAutomationTargetState(orgId, projectId, targetId, user.id, kms);
    return NextResponse.json({
      id: target.id,
      campaignStatus: target.campaign_status ?? null,
      dailyBudgetUsd: target.daily_budget_usd,
      lastReadStateAt: target.last_read_state_at ?? null,
    });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof AutomationTargetNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
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
    if (err instanceof GoogleAdsApiError || err instanceof MetaAdsApiError) {
      // The live platform read itself failed (bad id, revoked token, platform outage) — the
      // caller's page still has the last recorded state, so this is a 502-from-upstream, not a 500.
      return NextResponse.json({ error: 'platform_read_failed' }, { status: 502 });
    }
    throw err;
  }
}
