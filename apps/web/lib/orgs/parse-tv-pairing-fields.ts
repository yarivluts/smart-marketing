import { NextResponse, type NextRequest } from 'next/server';
import { parseJsonBody } from '@/lib/http/parse-json-body';

function invalid(error: string): { error: NextResponse } {
  return { error: NextResponse.json({ error }, { status: 400 }) };
}

export interface ParsedClaimTvPairingFields {
  code: string;
  boardIds: string[];
  rotationSeconds: number;
  reducedMotion: boolean;
  label: string;
}

export type ParsedClaimTvPairingRequest = (ParsedClaimTvPairingFields & { error?: undefined }) | { error: NextResponse };

interface RawClaimTvPairingBody {
  code?: unknown;
  boardIds?: unknown;
  rotationSeconds?: unknown;
  reducedMotion?: unknown;
  label?: unknown;
}

/**
 * Shape-only validation (the same "shape here, business rules in the
 * service" split `parseCreateWinRuleRequestBody`'s own doc comment
 * describes) — `claimTvPairing` (`tv-pairing.service.ts`) is the one that
 * rejects an unknown/expired code, an empty board list, or an out-of-range
 * rotation interval.
 */
export async function parseClaimTvPairingRequestBody(request: NextRequest): Promise<ParsedClaimTvPairingRequest> {
  const parsed = await parseJsonBody<RawClaimTvPairingBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const body = parsed.body;

  if (typeof body.code !== 'string' || body.code.trim().length === 0) {
    return invalid('code_required');
  }
  if (!Array.isArray(body.boardIds) || body.boardIds.length === 0 || !body.boardIds.every((id) => typeof id === 'string')) {
    return invalid('board_ids_required');
  }
  if (typeof body.rotationSeconds !== 'number' || !Number.isFinite(body.rotationSeconds)) {
    return invalid('invalid_rotation_seconds');
  }
  if (typeof body.reducedMotion !== 'boolean') {
    return invalid('invalid_reduced_motion');
  }
  if (typeof body.label !== 'string' || body.label.trim().length === 0) {
    return invalid('label_required');
  }

  return {
    code: body.code,
    boardIds: body.boardIds as string[],
    rotationSeconds: body.rotationSeconds,
    reducedMotion: body.reducedMotion,
    label: body.label,
  };
}
