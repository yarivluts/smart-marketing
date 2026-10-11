import { NextResponse, type NextRequest } from 'next/server';
import { saveAdStudioVideoSettings } from '@growthos/firebase-orm-models';
import type { AdStudioVideoSettings } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { toAdStudioBriefView } from '@/lib/ad-studio/store';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; briefId: string }>;
}

const FIELDS = ['resolution', 'style', 'music', 'musicDescription', 'avoid'] as const;

/** The string fields of a settings object from a request body; undefined when it is not an object. */
function parseSettings(value: unknown): Partial<AdStudioVideoSettings> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  return Object.fromEntries(FIELDS.filter((field) => typeof raw[field] === 'string').map((field) => [field, raw[field]])) as Partial<AdStudioVideoSettings>;
}

/**
 * Changes the ad's advanced video settings (resolution, visual style, music, what to avoid). Fields
 * left out keep their saved value. 400 with the issue code when a value is not valid. Gated on `ai.use`.
 */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, briefId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'ai.use');
  if (error) return error;
  const parsed = await parseJsonBody<{ settings?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const settings = parseSettings(parsed.body?.settings);
  if (!settings) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    await ensureFirestoreOrm();
    const brief = await saveAdStudioVideoSettings({ organizationId: orgId, projectId, briefId, settings });
    return NextResponse.json({ brief: toAdStudioBriefView(brief) });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}
