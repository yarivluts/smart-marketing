import { NextResponse, type NextRequest } from 'next/server';
import {
  FieldMappingDisabledError,
  FieldMappingNotFoundError,
  HookDeliveryAlreadyAppliedError,
  HookDeliveryDiscardedError,
  HookDeliveryNotFoundError,
  InvalidSamplePayloadError,
} from '@growthos/firebase-orm-models';
import { applyFieldMappingToDelivery } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseJsonBody } from '@/lib/http/parse-json-body';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; fieldMappingId: string }>;
}

/**
 * Applies a saved field mapping to one queued hook delivery for real (KAN-54's own follow-up:
 * `testRunFieldMapping` only ever previews). Maps + validates exactly like a test-run and, only
 * once that comes back clean, lands the mapped record via the ingest pipeline (KAN-32/33) and
 * marks the delivery `reviewed`+applied. Gated on `ingest.write`, same as every other hooks/
 * mappings route.
 */
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, fieldMappingId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseJsonBody<{ hookDeliveryId?: unknown }>(request);
  if (parsed.error) {
    return parsed.error;
  }
  const { hookDeliveryId } = parsed.body;
  if (typeof hookDeliveryId !== 'string' || hookDeliveryId.trim().length === 0) {
    return NextResponse.json({ error: 'hook_delivery_id_required' }, { status: 400 });
  }

  try {
    const result = await applyFieldMappingToDelivery({
      organizationId: orgId,
      projectId,
      fieldMappingId,
      hookDeliveryId,
      actorId: user.id,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FieldMappingNotFoundError || err instanceof HookDeliveryNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof InvalidSamplePayloadError) {
      return NextResponse.json({ error: 'invalid_sample_payload' }, { status: 400 });
    }
    if (err instanceof FieldMappingDisabledError) {
      return NextResponse.json({ error: 'mapping_disabled' }, { status: 400 });
    }
    if (err instanceof HookDeliveryDiscardedError) {
      return NextResponse.json({ error: 'delivery_discarded' }, { status: 400 });
    }
    if (err instanceof HookDeliveryAlreadyAppliedError) {
      return NextResponse.json({ error: 'already_applied' }, { status: 409 });
    }
    throw err;
  }
}
