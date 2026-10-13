import 'server-only';
import { NextResponse } from 'next/server';
import {
  GrowthChangeRequestEmptyError,
  GrowthPilotNotFoundError,
  GrowthPilotSiteInvalidError,
  GrowthProposalNotFoundError,
  GrowthProposalNotPendingError,
} from '@growthos/firebase-orm-models';
import { GrowthPilotNotReadyError, GrowthTargetRequestInvalidError } from '@/lib/ad-studio/engine';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';

/** Maps every Growth Pilot failure to a stable JSON code the page translates; AI and limit failures as in the Ad Studio. */
export function growthPilotErrorResponse(error: unknown): NextResponse {
  if (error instanceof GrowthPilotSiteInvalidError) return NextResponse.json({ error: 'invalid_site' }, { status: 400 });
  if (error instanceof GrowthChangeRequestEmptyError || error instanceof GrowthTargetRequestInvalidError) return NextResponse.json({ error: 'empty_request' }, { status: 400 });
  if (error instanceof GrowthPilotNotFoundError || error instanceof GrowthProposalNotFoundError) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (error instanceof GrowthProposalNotPendingError) return NextResponse.json({ error: 'not_pending', status: error.status }, { status: 409 });
  if (error instanceof GrowthPilotNotReadyError) return NextResponse.json({ error: 'not_ready' }, { status: 409 });
  return adStudioErrorResponse(error);
}
