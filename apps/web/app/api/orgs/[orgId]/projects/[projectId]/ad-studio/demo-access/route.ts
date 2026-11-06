import { NextResponse, type NextRequest } from 'next/server';
import { clearAdStudioDemoAccess, getAdStudioDemoAccess, setAdStudioDemoAccess } from '@growthos/firebase-orm-models';
import { parseAdStudioDemoAccessInput } from '@growthos/shared';
import { requireProjectPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';
import { adStudioErrorResponse } from '@/lib/ad-studio/http';
import { serverKms } from '@/lib/ad-studio/engine';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

/**
 * The trial (demo) account the Ad Studio records a product walkthrough with. The customer's own
 * account details, so `project.configure`. No response ever carries the password - only
 * `hasPassword`. The username and password are stored encrypted with the vault.
 */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  await ensureFirestoreOrm();
  return NextResponse.json({ demoAccess: await getAdStudioDemoAccess(orgId, projectId, serverKms()) });
}

/** Saves the trial access; an empty password keeps the stored one. Audited without the secrets. */
export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  const parsed = await parseJsonBody<{ demoAccess?: unknown }>(request);
  if (parsed.error) return parsed.error;
  const input = parseAdStudioDemoAccessInput(parsed.body?.demoAccess);
  if (!input) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const kms = serverKms();
  if (!kms) return NextResponse.json({ error: 'demo_request', code: 'vault_not_configured' }, { status: 503 });
  try {
    await ensureFirestoreOrm();
    const demoAccess = await setAdStudioDemoAccess({ organizationId: orgId, projectId, input, actorId: user.id, kms });
    return NextResponse.json({ demoAccess });
  } catch (err) {
    return adStudioErrorResponse(err);
  }
}

/** Removes the trial access. Recordings already made stay. Audited. */
export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireProjectPermission(orgId, projectId, 'project.configure');
  if (error) return error;
  await ensureFirestoreOrm();
  await clearAdStudioDemoAccess({ organizationId: orgId, projectId, actorId: user.id });
  return NextResponse.json({ demoAccess: null });
}
