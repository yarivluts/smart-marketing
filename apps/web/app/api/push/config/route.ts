import { NextResponse } from 'next/server';
import { publicWebPushConfig } from '@/lib/push/config';

export const dynamic = 'force-dynamic';

/** Whether push is set up here, and the public VAPID key a browser subscribes with. */
export function GET(): NextResponse {
  return NextResponse.json(publicWebPushConfig());
}
