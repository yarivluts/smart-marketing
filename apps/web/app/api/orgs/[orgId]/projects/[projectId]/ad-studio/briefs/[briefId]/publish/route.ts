import { NextResponse, type NextRequest } from 'next/server';
import { AdStudioExportInvalidError, AdStudioExportUnavailableError } from '@growthos/firebase-orm-models';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { publishBriefAd, type AdStudioPublishSource } from '@/lib/ad-studio/engine';
import { toAdStudioExportView } from '@/lib/ad-studio/store';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Creates a real ad from a finished creative on Meta or Google Ads - campaign, ad set / ad group,
 * creative and ad, all PAUSED for review on the platform - and returns it with its link. An outward
 * change on an ad platform: gated on `automation.execute` and audited.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'automation.execute');
  if (error) return error;
  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  const destination = body.destination;
  const sourceRaw = (body.source && typeof body.source === 'object' ? body.source : {}) as Record<string, unknown>;
  const source: AdStudioPublishSource | null =
    sourceRaw.kind === 'image' && typeof sourceRaw.imageId === 'string'
      ? { kind: 'image', imageId: sourceRaw.imageId }
      : sourceRaw.kind === 'video' && typeof sourceRaw.videoId === 'string'
        ? { kind: 'video', videoId: sourceRaw.videoId }
        : null;
  if ((destination !== 'meta' && destination !== 'google_ads') || !source) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const copy = (body.copy && typeof body.copy === 'object' ? body.copy : {}) as Record<string, unknown>;
  try {
    const row = await publishBriefAd({
      organizationId: orgId,
      projectId,
      briefId,
      destination,
      source,
      copy: { headline: text(copy.headline), primaryText: text(copy.primaryText), description: text(copy.description), linkUrl: text(copy.linkUrl), businessName: text(copy.businessName) },
      campaignName: text(body.campaignName),
      dailyBudget: typeof body.dailyBudget === 'number' ? body.dailyBudget : Number.NaN,
      countries: Array.isArray(body.countries) ? body.countries.filter((entry): entry is string => typeof entry === 'string') : [],
      ...(typeof body.containsEuPoliticalAdvertising === 'boolean' ? { containsEuPoliticalAdvertising: body.containsEuPoliticalAdvertising } : {}),
      actorId: user.id,
    });
    return NextResponse.json({ ad: toAdStudioExportView(row) }, { status: row.status === 'done' ? 201 : 502 });
  } catch (err) {
    if (err instanceof AdStudioExportUnavailableError) return NextResponse.json({ error: 'export_unavailable', reason: err.reason }, { status: 409 });
    if (err instanceof AdStudioExportInvalidError) return NextResponse.json({ error: 'invalid_export', reasons: err.reasons }, { status: 400 });
    return adStudioErrorResponse(err);
  }
}
