import { NextResponse, type NextRequest } from 'next/server';
import { InvalidProjectNameError, ProjectNotFoundError } from '@growthos/firebase-orm-models';
import { updateProjectDetails } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

interface UpdateProjectRequestBody {
  name?: unknown;
  vertical?: unknown;
  platformType?: unknown;
  businessModel?: unknown;
  transactionType?: unknown;
  primaryStack?: unknown;
  verifiedRequirements?: unknown;
  customHiddenModules?: unknown;
}

/**
 * Edits a project's own `name`/`vertical` and full profile metadata.
 * Gated on `project.manage`.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<UpdateProjectRequestBody>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const {
    name,
    vertical,
    platformType,
    businessModel,
    transactionType,
    primaryStack,
    verifiedRequirements,
    customHiddenModules,
  } = parsed.body;

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }
  if (vertical !== undefined && typeof vertical !== 'string') {
    return NextResponse.json({ error: 'invalid_vertical' }, { status: 400 });
  }

  try {
    const project = await updateProjectDetails({
      organizationId: orgId,
      projectId,
      name,
      vertical: typeof vertical === 'string' ? vertical : undefined,
      platformType: typeof platformType === 'string' ? platformType : undefined,
      businessModel: typeof businessModel === 'string' ? businessModel : undefined,
      transactionType: typeof transactionType === 'string' ? transactionType : undefined,
      primaryStack: typeof primaryStack === 'string' ? primaryStack : undefined,
      verifiedRequirements: Array.isArray(verifiedRequirements) ? verifiedRequirements.filter((r): r is string => typeof r === 'string') : undefined,
      customHiddenModules: Array.isArray(customHiddenModules) ? customHiddenModules.filter((m): m is string => typeof m === 'string') : undefined,
      actorUserId: user.id,
    });
    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        vertical: project.vertical ?? '',
        platformType: project.platform_type ?? 'web',
        businessModel: project.business_model ?? 'saas_subscription',
        transactionType: project.transaction_type ?? 'monthly_recurring',
        primaryStack: project.primary_stack ?? 'custom_web',
        verifiedRequirements: project.verified_requirements ?? [],
        customHiddenModules: project.custom_hidden_modules ?? [],
      },
    });
  } catch (err) {
    if (err instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidProjectNameError) {
      return NextResponse.json({ error: 'name_required' }, { status: 400 });
    }
    throw err;
  }
}
