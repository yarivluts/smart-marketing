import { NextResponse, type NextRequest } from 'next/server';
import {
  EnvironmentNotFoundError,
  Ga4CredentialConfigError,
  NotASourcePluginError,
  PluginInstallNotActiveError,
  PluginInstallNotFoundError,
  PluginManifestNotFoundError,
  ProjectNotFoundError,
  StripeCredentialConfigError,
} from '@growthos/firebase-orm-models';
import { runSourcePluginInstall } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { toSourcePluginRunView } from '@/lib/orgs/plugin-view';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; installId: string }>;
}

/**
 * Manually triggers one incremental sync run for a source-plugin install
 * "right now" (KAN-47's buildable-today stand-in for "scheduled execution"
 * — see `@growthos/firebase-orm-models`'s `plugin-runtime.service.ts` for
 * why a real Cloud Run job scheduler is deferred to KAN-18). Gated on
 * `plugin.install`, the same permission every other action on this install
 * already requires. `runSourcePluginInstall` (KAN-49/KAN-52) transparently
 * swaps in a real `StripeSourcePluginExecutor`/`Ga4SourcePluginExecutor` when
 * this install is one of the built-in connectors — every other plugin still
 * gets the KAN-47 toy executor, unchanged.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, installId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'plugin.install');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ environmentId?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { environmentId } = parsed.body;
  if (typeof environmentId !== 'string' || environmentId.trim().length === 0) {
    return NextResponse.json({ error: 'environment_id_required' }, { status: 400 });
  }

  // Only the built-in Stripe plugin ever consults this — resolved best-effort so a deployment
  // without the vault configured (KAN-18) doesn't break "Run now" for every *other* plugin too.
  let kms;
  try {
    kms = getServerKmsProvider();
  } catch (err) {
    if (!(err instanceof VaultNotConfiguredError)) {
      throw err;
    }
  }

  try {
    const run = await runSourcePluginInstall({
      organizationId: orgId,
      projectId,
      environmentId,
      installId,
      triggeredByUserId: user.id,
      kms,
    });
    return NextResponse.json({ run: toSourcePluginRunView(run) });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof EnvironmentNotFoundError || err instanceof PluginInstallNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof PluginInstallNotActiveError) {
      return NextResponse.json({ error: 'install_not_active' }, { status: 409 });
    }
    if (err instanceof NotASourcePluginError || err instanceof PluginManifestNotFoundError) {
      return NextResponse.json({ error: 'not_a_source_plugin' }, { status: 400 });
    }
    if (err instanceof StripeCredentialConfigError) {
      return NextResponse.json({ error: 'stripe_credential_not_configured', reason: err.reason }, { status: 400 });
    }
    if (err instanceof Ga4CredentialConfigError) {
      return NextResponse.json({ error: 'ga4_credential_not_configured', reason: err.reason }, { status: 400 });
    }
    throw err;
  }
}
