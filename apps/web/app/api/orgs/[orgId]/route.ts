import { NextResponse, type NextRequest } from 'next/server';
import { InvalidOrganizationNameError, OrganizationNotFoundError } from '@growthos/firebase-orm-models';
import { updateOrganization } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

interface UpdateOrganizationRequestBody {
  name?: unknown;
  slug?: unknown;
  billingEmail?: unknown;
}

/**
 * Edits the org's own `name`/`slug`/`billing_email` — the tenancy root
 * itself had create-then-never-edit until now (KAN-100/117/119/120/121
 * already closed this same gap for their own sibling registries). Gated on
 * `billing.manage` (org-owner-only), not the more permissive
 * `project.manage` an `org_admin` also holds — see `updateOrganization`'s
 * own doc comment for why.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'billing.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<UpdateOrganizationRequestBody>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const { name, slug, billingEmail } = parsed.body;
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (slug !== undefined && typeof slug !== 'string') {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }
  if (billingEmail !== undefined && typeof billingEmail !== 'string') {
    return NextResponse.json({ error: 'invalid_billing_email' }, { status: 400 });
  }

  try {
    const organization = await updateOrganization({
      organizationId: orgId,
      name,
      slug,
      billingEmail,
      actorUserId: user.id,
    });
    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug ?? '',
        billingEmail: organization.billing_email ?? '',
      },
    });
  } catch (err) {
    if (err instanceof OrganizationNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidOrganizationNameError) {
      return NextResponse.json({ error: 'name_required' }, { status: 400 });
    }
    throw err;
  }
}
