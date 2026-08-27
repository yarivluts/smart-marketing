import { NextResponse, type NextRequest } from 'next/server';
import { FieldMappingNotFoundError, InvalidFieldMappingError, TargetSchemaNotRegisteredError } from '@growthos/firebase-orm-models';
import { disableFieldMapping, updateFieldMapping } from '@/lib/orgs/mutations';
import { requireOrgPermission } from '@/lib/orgs/access';
import { parseUpdateFieldMappingRequestBody } from '@/lib/orgs/parse-field-mapping-rules';
import { toFieldMappingView } from '@/lib/orgs/field-mapping-view';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string; fieldMappingId: string }>;
}

/** Retires a field mapping immediately (KAN-54) — gated on `ingest.write`, same as creating one. */
export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, fieldMappingId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  try {
    await disableFieldMapping({ organizationId: orgId, projectId, fieldMappingId, disabledByUserId: user.id });
    return NextResponse.json({ status: 'disabled' });
  } catch (err) {
    if (err instanceof FieldMappingNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    throw err;
  }
}

/**
 * Edits an existing mapping's own definition — name, target schema, and
 * rules — always a full replace (KAN-121, same "create + list only, no way
 * to fix a typo'd name or a wrong JSONPath rule" gap KAN-100/KAN-117/
 * KAN-119/KAN-120 already closed for their own sibling registries). `kind`
 * and `environmentId` stay immutable — see `updateFieldMapping`'s own doc
 * comment. Gated on `ingest.write`, same as every other mutation on this
 * route.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId, fieldMappingId } = await params;
  const { user, error } = await requireOrgPermission(orgId, 'ingest.write');
  if (error) {
    return error;
  }

  const parsed = await parseUpdateFieldMappingRequestBody(request);
  if (parsed.error) {
    return parsed.error;
  }

  try {
    const mapping = await updateFieldMapping({
      organizationId: orgId,
      projectId,
      fieldMappingId,
      name: parsed.name,
      schemaName: parsed.schemaName,
      rules: parsed.rules,
      actorUserId: user.id,
    });
    return NextResponse.json({ fieldMapping: toFieldMappingView(mapping) });
  } catch (err) {
    if (err instanceof FieldMappingNotFoundError) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (err instanceof TargetSchemaNotRegisteredError) {
      return NextResponse.json({ error: 'target_schema_not_registered' }, { status: 400 });
    }
    if (err instanceof InvalidFieldMappingError) {
      return NextResponse.json({ error: 'invalid_rules', reasons: err.reasons }, { status: 400 });
    }
    throw err;
  }
}
