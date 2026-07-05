import { NextResponse, type NextRequest } from 'next/server';
import { isResourceTemplateType } from '@growthos/firebase-orm-models';
import { createResourceTemplate } from '@/lib/orgs/mutations';
import { listResourceTemplates } from '@/lib/orgs/queries';
import { requireOrgMembership, requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/** Lists the org's resource templates — any active member. */
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { error } = await requireOrgMembership(orgId);
  if (error) {
    return error;
  }

  const templates = await listResourceTemplates(orgId);
  return NextResponse.json({
    templates: templates.map((template) => ({
      id: template.id,
      name: template.name,
      type: template.type,
      version: template.version,
    })),
  });
}

/** Registers a new org-standard template (version 1) — requires `resources.manage`. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown; type?: unknown; config?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, type, config } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (typeof type !== 'string' || !isResourceTemplateType(type)) {
    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });
  }
  if (config !== undefined && (typeof config !== 'object' || config === null || Array.isArray(config))) {
    return NextResponse.json({ error: 'invalid_config' }, { status: 400 });
  }

  const template = await createResourceTemplate({
    organizationId: orgId,
    name: name.trim(),
    type,
    config: config as Record<string, unknown> | undefined,
    createdByUserId: user.id,
  });
  return NextResponse.json({ templateId: template.id }, { status: 201 });
}
