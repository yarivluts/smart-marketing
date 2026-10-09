import { NextResponse, type NextRequest } from 'next/server';
import { extractTvDeviceToken } from '@/lib/orgs/tv-viewer-auth';
import { acknowledgeTvPairingCommand } from '@/lib/orgs/mutations';
import type { TvPairingPowerState } from '@growthos/firebase-orm-models';

/**
 * TV kiosk client acknowledges execution of a remote hardware or display command (KAN-307).
 * Authenticated via Bearer device token.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = extractTvDeviceToken(request);
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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

  const { commandId, status, error, powerState } = body as {
    commandId?: unknown;
    status?: unknown;
    error?: unknown;
    powerState?: unknown;
  };

  if (typeof commandId !== 'string' || !commandId.trim()) {
    return NextResponse.json({ error: 'missing_command_id' }, { status: 400 });
  }

  if (status !== 'acknowledged' && status !== 'failed') {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
  }

  const validPowerStates: TvPairingPowerState[] = ['on', 'standby', 'sleep'];
  const validatedPowerState = typeof powerState === 'string' && validPowerStates.includes(powerState as TvPairingPowerState)
    ? (powerState as TvPairingPowerState)
    : undefined;

  const result = await acknowledgeTvPairingCommand({
    deviceToken: token,
    commandId: commandId.trim(),
    status,
    error: typeof error === 'string' ? error : undefined,
    powerState: validatedPowerState,
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    commandId,
    powerState: result.value.power_state ?? 'on',
  });
}
