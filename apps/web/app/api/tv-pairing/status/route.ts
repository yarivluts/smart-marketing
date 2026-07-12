import { NextResponse, type NextRequest } from 'next/server';
import { getTvPairingStatus } from '@/lib/orgs/queries';

/**
 * The TV's own poll loop (KAN-67): before claim, reports `pending` (with the
 * code's own expiry so the TV can show a countdown/refresh itself once it
 * lapses) or `expired`; after claim, reports the board/rotation config an
 * admin chose so the TV can transition into rotation mode. Never 401s on an
 * unknown/garbage token the way `requireTvViewer` does for the data/win-feed
 * routes below — a token this route doesn't recognize is simply reported as
 * `invalid` in the response body, since the *whole point* of this endpoint
 * is to be pollable by a device that doesn't know its own status yet.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ status: 'invalid' });
  }

  const status = await getTvPairingStatus(token);
  return NextResponse.json(status);
}
