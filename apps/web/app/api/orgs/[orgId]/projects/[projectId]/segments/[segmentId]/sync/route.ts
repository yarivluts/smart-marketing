import { NextResponse, type NextRequest } from 'next/server';
import {
  CrmWebhookCredentialConfigError,
  NotAnActionPluginError,
  PluginInstallNotActiveError,
  PluginInstallNotFoundError,
  PluginManifestNotFoundError,
  SegmentNotFoundError,
} from '@growthos/firebase-orm-models';
import { syncSegmentToCrm } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toCrmSyncRunView } from '@/lib/orgs/crm-sync-view';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; segmentId: string }>;
}

/**
 * Pushes one saved segment's own currently-matching entity rows out to a
 * configured action-type plugin install "right now" (KAN-81, plan `14 §Gap
 * 5`: "export/sync to CRM") — the outbound mirror of `.../plugins/[installId]/run`
 * (KAN-47). Gated on `dashboards.write`, reusing this segment's own feature
 * permission (the same reasoning every other segment mutation on this route
 * family already gives — this is a segment action, not a generic plugin
 * action).
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, segmentId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ installId?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { installId } = parsed.body;
  if (typeof installId !== 'string' || installId.trim().length === 0) {
    return NextResponse.json({ error: 'install_id_required' }, { status: 400 });
  }

  // Unlike the KAN-47 "Run now" route (where `kms` is only consulted for specific built-in
  // connectors and every other plugin runs fine without it), every CRM-sync action needs a real
  // credential — a missing vault config here means the deploy is misconfigured, not that the caller
  // did anything wrong, the same "500, not 400" posture `getServerKmsProvider`'s own doc comment and
  // every other always-needs-kms route (e.g. the credential secret routes) already establish.
  let kms;
  try {
    kms = getServerKmsProvider();
  } catch (err) {
    if (err instanceof VaultNotConfiguredError) {
      return NextResponse.json({ error: 'vault_not_configured' }, { status: 500 });
    }
    throw err;
  }

  try {
    const run = await syncSegmentToCrm({ organizationId: orgId, projectId, segmentId, installId, triggeredByUserId: user.id, kms });
    return NextResponse.json({ run: toCrmSyncRunView(run) });
  } catch (err) {
    if (err instanceof SegmentNotFoundError || err instanceof PluginInstallNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof PluginInstallNotActiveError) {
      return NextResponse.json({ error: 'install_not_active' }, { status: 409 });
    }
    if (err instanceof NotAnActionPluginError || err instanceof PluginManifestNotFoundError) {
      return NextResponse.json({ error: 'not_an_action_plugin' }, { status: 400 });
    }
    if (err instanceof CrmWebhookCredentialConfigError) {
      return NextResponse.json({ error: 'crm_credential_not_configured', reason: err.reason }, { status: 400 });
    }
    throw err;
  }
}
