import { NextResponse, type NextRequest } from 'next/server';
import { saveAdStudioSearchKeywords } from '@growthos/firebase-orm-models';
import type { AdStudioSearchKeyword, AdStudioSearchKeywords } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

/** A keyword list from a request body, null to clear, or undefined when malformed (rules are checked on save). */
function parseKeywords(value: unknown): AdStudioSearchKeywords | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const targeting = raw.targeting as Record<string, unknown> | undefined;
  if (!targeting || typeof targeting.country !== 'string' || typeof targeting.language !== 'string') return undefined;
  if (!Array.isArray(raw.keywords) || !Array.isArray(raw.negatives)) return undefined;
  const number = (field: unknown) => (typeof field === 'number' ? field : null);
  return {
    targeting: { country: targeting.country, language: targeting.language },
    keywords: raw.keywords
      .filter((keyword): keyword is Record<string, unknown> => Boolean(keyword) && typeof keyword === 'object')
      .map((keyword) => ({
        text: typeof keyword.text === 'string' ? keyword.text : '',
        matchType: keyword.matchType as AdStudioSearchKeyword['matchType'],
        avgMonthlySearches: number(keyword.avgMonthlySearches),
        competition: (keyword.competition ?? null) as AdStudioSearchKeyword['competition'],
        lowTopOfPageBid: number(keyword.lowTopOfPageBid),
        highTopOfPageBid: number(keyword.highTopOfPageBid),
      })),
    negatives: raw.negatives.filter((negative): negative is string => typeof negative === 'string'),
  };
}

/**
 * Saves the keywords the search ad bids on (with match types and the volumes they were chosen by),
 * where they were looked up, and the negatives; `keywords: null` clears them. 400 with every broken
 * rule. Gated on `ai.use`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ keywords?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const keywords = parseKeywords(parsed.body?.keywords);
  if (keywords === undefined) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const brief = await saveAdStudioSearchKeywords({ organizationId: orgId, projectId, briefId, keywords });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
