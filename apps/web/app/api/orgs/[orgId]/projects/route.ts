import { NextResponse, type NextRequest } from 'next/server';
import { createProject } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

/** Creates a project in an org — requires `project.manage` at the org scope. */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId } = await params;
  const { error, user } = await requireOrgPermission(orgId, 'project.manage');
  if (error) {
    return error;
  }

  interface CreateProjectRequestBody {
    name?: unknown;
    vertical?: unknown;
    platformType?: unknown;
    businessModel?: unknown;
    transactionType?: unknown;
    primaryStack?: unknown;
  }

  const parsed = await parseJsonBody<CreateProjectRequestBody>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { name, vertical, platformType, businessModel, transactionType, primaryStack } = parsed.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name_required' }, { status: 400 });
  }

  const { project } = await createProject({
    organizationId: orgId,
    name: name.trim(),
    vertical: typeof vertical === 'string' ? vertical.trim() : undefined,
    platformType: typeof platformType === 'string' ? platformType.trim() : undefined,
    businessModel: typeof businessModel === 'string' ? businessModel.trim() : undefined,
    transactionType: typeof transactionType === 'string' ? transactionType.trim() : undefined,
    primaryStack: typeof primaryStack === 'string' ? primaryStack.trim() : undefined,
    createdByUserId: user.id,
  });
  return NextResponse.json({ projectId: project.id }, { status: 201 });
}
