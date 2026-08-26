import { NextResponse, type NextRequest } from 'next/server';
import { ResourceNotFoundError } from '@growthos/firebase-orm-models';
import { updateOrgPerson } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; personId: string }>;
}

/**
 * Edits an existing person in the org's people registry (KAN-99 —
 * `createOrgPerson`/`listOrgPeople` had create + list but no way to fix a
 * typo'd name or a stale email/title/photo, unlike every other
 * user-manageable entity in this codebase) — same `resources.manage` gate
 * as creating one. A blank optional field clears it, mirroring `POST`'s own
 * "omit to leave unset" convention.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, personId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown; email?: unknown; title?: unknown; photoUrl?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, email, title, photoUrl } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (email !== undefined && typeof email !== 'string') {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (title !== undefined && typeof title !== 'string') {
    return NextResponse.json({ error: 'invalid_title' }, { status: 400 });
  }
  if (photoUrl !== undefined && typeof photoUrl !== 'string') {
    return NextResponse.json({ error: 'invalid_photo_url' }, { status: 400 });
  }

  const normalize = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

  try {
    const person = await updateOrgPerson({
      organizationId: orgId,
      personId,
      name: name.trim(),
      email: normalize(email),
      title: normalize(title),
      photoUrl: normalize(photoUrl),
      actorId: user.id,
    });
    return NextResponse.json({
      person: {
        id: person.id,
        name: person.name,
        email: person.email,
        title: person.title,
        photoUrl: person.photo_url,
      },
    });
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
