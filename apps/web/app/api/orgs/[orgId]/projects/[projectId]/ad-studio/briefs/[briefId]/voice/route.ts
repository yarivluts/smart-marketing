import { NextResponse, type NextRequest } from 'next/server';
import { saveAdStudioVoice } from '@growthos/firebase-orm-models';
import type { AdStudioVoice } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** A voice from a request body, null to clear, or undefined when absent or malformed. */
function parseVoice(value: unknown): AdStudioVoice | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.preset !== 'string') return undefined;
  return {
    preset: raw.preset as AdStudioVoice['preset'],
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
  };
}

/**
 * Sets the ad's narrator voice - one voice for every scene - or clears it (`voice: null`). 400 with
 * the voice's issue code when it is not valid. Gated on `ai.use`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ voice?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const voice = parseVoice(parsed.body?.voice);
  if (voice === undefined) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const brief = await saveAdStudioVoice({ organizationId: orgId, projectId, briefId, voice });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
