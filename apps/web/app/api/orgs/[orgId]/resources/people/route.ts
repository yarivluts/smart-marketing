import { NextResponse, type NextRequest } from 'next/server';
import { createOrgPerson } from '@/lib/orgs/mutations';
import { listOrgPeople } from '@/lib/orgs/queries';
import { requireOrgMembership, requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/** Lists the org's people registry (`dim_team_member`) — any active member. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { error } = await requireOrgMembership(orgId);
  if (error) {
    return error;
  }

  const people = await listOrgPeople(orgId);
  return NextResponse.json({
    people: people.map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      title: person.title,
      photoUrl: person.photo_url,
    })),
  });
}

/** Adds a person to the org's registry — requires `resources.manage`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
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

  const person = await createOrgPerson({
    organizationId: orgId,
    name: name.trim(),
    email,
    title,
    photoUrl,
    createdByUserId: user.id,
  });
  return NextResponse.json({ personId: person.id }, { status: 201 });
}
