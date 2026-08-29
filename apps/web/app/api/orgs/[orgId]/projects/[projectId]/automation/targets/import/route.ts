import { NextResponse, type NextRequest } from 'next/server';
import { InvalidAutomationActionError, ProjectNotFoundError, type ExternalCampaignSnapshotInput } from '@growthos/firebase-orm-models';
import { importExternalCampaignSnapshots } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * Campaign discovery/sync (the read-direction sibling of the action queue):
 * upserts one target row per observed live campaign pushed by a connector/
 * agent that can read the real ad platform — pure observation, never a
 * platform write, so `automation.execute` (the same gate that lets a user
 * seed targets) is the right permission. Field-level validation and size
 * caps live in `importExternalCampaignSnapshots` itself; this route only
 * checks the envelope, mirroring the seed route's own split.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'automation.execute');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ environmentId?: unknown; snapshots?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { environmentId, snapshots } = parsed.body;
  if (typeof environmentId !== 'string' || environmentId.trim().length === 0) {
    return NextResponse.json({ error: 'environment_id_required' }, { status: 400 });
  }
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return NextResponse.json({ error: 'snapshots_required' }, { status: 400 });
  }

  try {
    const result = await importExternalCampaignSnapshots(
      orgId,
      projectId,
      environmentId,
      snapshots as ExternalCampaignSnapshotInput[],
      user.id,
    );
    return NextResponse.json({ created: result.created, updated: result.updated, targetIds: result.targetIds }, { status: 201 });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidAutomationActionError) {
      return NextResponse.json({ error: 'invalid_request', message: err.message }, { status: 400 });
    }
    throw err;
  }
}
