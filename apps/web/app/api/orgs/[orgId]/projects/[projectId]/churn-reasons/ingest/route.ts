import { NextResponse, type NextRequest } from 'next/server';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import {
  ingestCancellationReasonFeedback,
  listEnvironmentsForProject,
  ProjectNotFoundError,
  type IngestCancellationReasonFeedbackItem,
} from '@growthos/firebase-orm-models';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export interface ChurnReasonIngestRequestBody {
  environmentId?: string;
  records?: IngestCancellationReasonFeedbackItem[];
  feedback?: IngestCancellationReasonFeedbackItem[];
  reasonCode?: string;
  comment?: string | null;
  customerId?: string | null;
  timestamp?: string | null;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;

  const permCheck = await requireOrgPermission(orgId, 'ingest.write');
  if (permCheck.error) {
    return permCheck.error;
  }

  const parsed = await parseJsonBody<ChurnReasonIngestRequestBody>(request);
  if (parsed.error) {
    return parsed.error;
  }

  const body = parsed.body;
  let items: IngestCancellationReasonFeedbackItem[] = [];

  if (Array.isArray(body.records) && body.records.length > 0) {
    items = body.records;
  } else if (Array.isArray(body.feedback) && body.feedback.length > 0) {
    items = body.feedback;
  } else if (typeof body.reasonCode === 'string' && body.reasonCode.trim().length > 0) {
    items = [
      {
        reasonCode: body.reasonCode.trim(),
        comment: body.comment,
        customerId: body.customerId,
        timestamp: body.timestamp,
      },
    ];
  }

  if (items.length === 0) {
    return NextResponse.json(
      { error: 'At least one valid reasonCode must be provided in body (single reasonCode or records/feedback array).' },
      { status: 400 },
    );
  }

  await ensureFirestoreOrm();

  try {
    let environmentId = body.environmentId?.trim();
    if (!environmentId) {
      try {
        const envs = await listEnvironmentsForProject(orgId, projectId);
        environmentId = envs.length > 0 ? envs[0].id : 'default';
      } catch {
        environmentId = 'default';
      }
    }

    const result = await ingestCancellationReasonFeedback({
      organizationId: orgId,
      projectId,
      environmentId,
      feedback: items,
      createdByUserId: permCheck.user.id,
    });

    return NextResponse.json({
      ok: true,
      batchId: result.batchId,
      accepted: result.accepted,
      quarantined: result.quarantined,
    });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Failed to ingest cancellation reasons';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
