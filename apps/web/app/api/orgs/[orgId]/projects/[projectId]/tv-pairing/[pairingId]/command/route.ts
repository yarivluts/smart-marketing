import { NextResponse, type NextRequest } from 'next/server';
import {
  InvalidTvPairingError,
  TvPairingNotFoundError,
  TvPairingRevokedError,
  type TvPairingCommandType,
} from '@growthos/firebase-orm-models';
import { sendTvPairingCommand } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { toTvPairingSummaryView } from '@/lib/orgs/tv-pairing-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; pairingId: string }>;
}

const ALLOWED_COMMANDS: readonly TvPairingCommandType[] = [
  'reboot',
  'display_sleep',
  'display_wake',
  'force_reload',
];

/**
 * Dispatches a remote display power or hardware management command to a paired TV display (KAN-307).
 * Gated on `dashboards.write`.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, pairingId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 });
  }

  const { type, parameters } = body as { type?: unknown; parameters?: unknown };

  if (typeof type !== 'string' || !ALLOWED_COMMANDS.includes(type as TvPairingCommandType)) {
    return NextResponse.json(
      {
        error: 'invalid_command_type',
        reasons: [`Command type must be one of: ${ALLOWED_COMMANDS.join(', ')}`],
      },
      { status: 400 },
    );
  }

  try {
    const pairing = await sendTvPairingCommand({
      organizationId: orgId,
      projectId,
      pairingId,
      type: type as TvPairingCommandType,
      actorUserId: user.id,
      parameters: typeof parameters === 'object' && parameters !== null ? (parameters as Record<string, unknown>) : undefined,
    });

    return NextResponse.json({
      success: true,
      command: pairing.pending_command,
      pairing: toTvPairingSummaryView(pairing),
    });
  } catch (err) {
    if (err instanceof TvPairingNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidTvPairingError) {
      return NextResponse.json({ error: 'invalid_tv_pairing', reasons: err.reasons }, { status: 400 });
    }
    if (err instanceof TvPairingRevokedError) {
      return NextResponse.json({ error: 'revoked' }, { status: 409 });
    }
    throw err;
  }
}
