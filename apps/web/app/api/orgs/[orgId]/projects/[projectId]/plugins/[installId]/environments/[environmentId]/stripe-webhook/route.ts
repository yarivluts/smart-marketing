import { NextResponse, type NextRequest } from 'next/server';
import {
  EnvironmentNotFoundError,
  PluginInstallNotFoundError,
  ProjectNotFoundError,
  StripeCredentialConfigError,
  StripeWebhookSignatureError,
} from '@growthos/firebase-orm-models';
import { processStripeWebhookEvent } from '@/lib/orgs/mutations';
import { getServerKmsProvider, VaultNotConfiguredError } from '@/lib/vault/kms-provider';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; installId: string; environmentId: string }>;
}

/**
 * The Stripe webhook delivery endpoint (KAN-49, plan `13 §E8.1`: "webhooks").
 * Deliberately **not** gated by `requireOrgPermission` — Stripe calls this
 * directly with no GrowthOS session, authenticated instead by the
 * `Stripe-Signature` header against the install's own configured webhook
 * signing secret (`processStripeWebhookEvent`). Reads the request body as
 * raw text, not JSON, since signature verification is byte-sensitive — a
 * re-serialized body would compute a different (and wrong) signature.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, installId, environmentId } = await params;

  const signatureHeader = request.headers.get('stripe-signature');
  if (!signatureHeader) {
    return NextResponse.json({ error: 'missing_signature_header' }, { status: 400 });
  }
  const rawBody = await request.text();

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
    const result = await processStripeWebhookEvent({
      organizationId: orgId,
      projectId,
      environmentId,
      installId,
      rawBody,
      signatureHeader,
      kms,
    });
    return NextResponse.json({ eventId: result.eventId, handled: result.handled });
  } catch (err) {
    if (err instanceof ProjectNotFoundError || err instanceof EnvironmentNotFoundError || err instanceof PluginInstallNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof StripeWebhookSignatureError || err instanceof StripeCredentialConfigError) {
      return NextResponse.json({ error: 'invalid_webhook' }, { status: 400 });
    }
    throw err;
  }
}
