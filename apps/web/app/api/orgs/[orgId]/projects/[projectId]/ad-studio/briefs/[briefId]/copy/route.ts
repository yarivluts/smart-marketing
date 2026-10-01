import { NextResponse, type NextRequest } from 'next/server';
import { saveAdStudioCopy } from '@growthos/firebase-orm-models';
import type { AdStudioAdCopy } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** A copy object from a request body, null to clear, or undefined when absent or malformed. */
function parseCopy(value: unknown): AdStudioAdCopy | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const text = (field: unknown) => (typeof field === 'string' ? field : '');
  return { headline: text(raw.headline), primaryText: text(raw.primaryText), description: text(raw.description) };
}

/**
 * Saves the ad copy (KAN-278) a person edited: `videoCopy` and/or `conceptCopies` keyed by image idea
 * id; null clears one. 400 with each broken limit. Gated on `ai.use`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ videoCopy?: unknown; conceptCopies?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  const videoCopy = 'videoCopy' in body ? parseCopy(body.videoCopy) : undefined;
  const conceptCopies =
    body.conceptCopies && typeof body.conceptCopies === 'object'
      ? Object.fromEntries(
          Object.entries(body.conceptCopies as Record<string, unknown>)
            .map(([id, copy]) => [id, parseCopy(copy)] as const)
            .filter((entry): entry is readonly [string, AdStudioAdCopy | null] => entry[1] !== undefined),
        )
      : undefined;
  if (videoCopy === undefined && !conceptCopies) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const brief = await saveAdStudioCopy({ organizationId: orgId, projectId, briefId, ...(videoCopy !== undefined ? { videoCopy } : {}), ...(conceptCopies ? { conceptCopies } : {}) });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
