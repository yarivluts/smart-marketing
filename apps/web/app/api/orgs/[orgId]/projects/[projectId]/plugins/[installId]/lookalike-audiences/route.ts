import { NextResponse, type NextRequest } from 'next/server';
import {
  InvalidMetaLookalikeAudienceRequestError,
  MetaAudienceCredentialConfigError,
  MetaLookalikeAudienceCreationFailedError,
  MetaLookalikeSeedAudienceNotReadyError,
  NotMetaCustomAudiencePluginError,
  PluginInstallNotActiveError,
  PluginInstallNotFoundError,
  ProjectNotFoundError,
} from '@growthos/firebase-orm-models';
import { createMetaLookalikeAudience } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { toMetaLookalikeAudienceView } from '@/lib/orgs/crm-sync-view';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; installId: string }>;
}

/**
 * Creates a Meta Lookalike Audience seeded from a Meta Custom Audience
 * install's own already-synced Custom Audience (KAN-73 follow-up, plan `13
 * §E21.3`'s own "Custom/Lookalike audience creation from GrowthOS segments"
 * bullet — see `createMetaLookalikeAudience`'s own doc comment). Gated on
 * `plugin.install`, the same permission every other action on this install
 * already requires.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, installId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'plugin.install');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown; country?: unknown; ratio?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, country, ratio } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (typeof country !== 'string' || country.trim().length === 0) {
    return NextResponse.json({ error: 'country_required' }, { status: 400 });
  }
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
    return NextResponse.json({ error: 'ratio_required' }, { status: 400 });
  }

  // Same "always needs a real credential, 500 not 400 on a missing vault" posture the CRM-sync
  // route's own doc comment establishes — a Lookalike Audience always needs to resolve a real Meta
  // Ads credential.
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
    const audience = await createMetaLookalikeAudience({ organizationId: orgId, projectId, installId, name, country, ratio, createdByUserId: user.id, kms });
    return NextResponse.json({ audience: toMetaLookalikeAudienceView(audience) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof PluginInstallNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof PluginInstallNotActiveError) {
      return NextResponse.json({ error: 'install_not_active' }, { status: 409 });
    }
    if (err instanceof NotMetaCustomAudiencePluginError) {
      return NextResponse.json({ error: 'not_meta_custom_audience_plugin' }, { status: 400 });
    }
    if (err instanceof MetaLookalikeSeedAudienceNotReadyError) {
      return NextResponse.json({ error: 'seed_audience_not_ready' }, { status: 409 });
    }
    if (err instanceof InvalidMetaLookalikeAudienceRequestError) {
      return NextResponse.json({ error: 'invalid_request', reasons: err.reasons }, { status: 400 });
    }
    if (err instanceof MetaAudienceCredentialConfigError) {
      return NextResponse.json({ error: 'meta_audience_credential_not_configured', reason: err.reason }, { status: 400 });
    }
    if (err instanceof MetaLookalikeAudienceCreationFailedError) {
      return NextResponse.json({ error: 'meta_api_error', reason: err.reason }, { status: 502 });
    }
    throw err;
  }
}
