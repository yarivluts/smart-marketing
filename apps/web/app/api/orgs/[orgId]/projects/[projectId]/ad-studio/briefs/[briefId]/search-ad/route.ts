import { NextResponse, type NextRequest } from 'next/server';
import { saveAdStudioSearchAd } from '@growthos/firebase-orm-models';
import type { AdStudioSearchAd } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** A search ad from a request body, null to clear, or undefined when malformed (rules are checked on save). */
function parseAd(value: unknown): AdStudioSearchAd | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const lines = (field: unknown) => (Array.isArray(field) ? field.filter((line): line is string => typeof line === 'string') : null);
  const headlines = lines(raw.headlines);
  const descriptions = lines(raw.descriptions);
  if (!headlines || !descriptions) return undefined;
  return { headlines, descriptions, path1: typeof raw.path1 === 'string' ? raw.path1 : '', path2: typeof raw.path2 === 'string' ? raw.path2 : '' };
}

/** Saves the responsive search ad a person edited; `ad: null` clears it. 400 with every broken rule. Gated on `ai.use`. */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ ad?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const ad = parseAd(parsed.body?.ad);
  if (ad === undefined) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const brief = await saveAdStudioSearchAd({ organizationId: orgId, projectId, briefId, ad });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
