import { NextResponse, type NextRequest } from 'next/server';
import { ResourceNotFoundError } from '@growthos/firebase-orm-models';
import { updateResourceTemplate } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; templateId: string }>;
}

/**
 * Edits an existing org-standard template's name/config, bumping `version`
 * (KAN-117 — `createResourceTemplate`/`listResourceTemplates` had create +
 * list only, the same gap KAN-100 closed for the people registry; see
 * `updateResourceTemplate`'s own doc comment). Same `resources.manage` gate
 * as creating one. An omitted `config` clears it, mirroring `PATCH
 * .../people/[personId]`'s own "omit to leave unset" convention.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, templateId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'resources.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ name?: unknown; config?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, config } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (config !== undefined && (typeof config !== 'object' || config === null || Array.isArray(config))) {
    return NextResponse.json({ error: 'invalid_config' }, { status: 400 });
  }

  try {
    const template = await updateResourceTemplate({
      organizationId: orgId,
      templateId,
      name: name.trim(),
      config: config as Record<string, unknown> | undefined,
      actorId: user.id,
    });
    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
        type: template.type,
        version: template.version,
        config: template.config,
      },
    });
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}
