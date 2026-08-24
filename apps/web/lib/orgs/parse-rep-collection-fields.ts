import { NextResponse, type NextRequest } from 'next/server';
import { parseJsonBody } from '@/lib/http/parse-json-body';

function invalid(error: string): { error: NextResponse } {
  return { error: NextResponse.json({ error }, { status: 400 }) };
}

export interface ParsedCreateRepCollectionEntryFields {
  orgPersonId: string | null;
  company: string;
  collectionType: string;
  planFrom?: string;
  planTo?: string;
  amount: number;
  occurredAt: string;
  note?: string;
  sourceRawRecordId?: string;
}

export type ParsedCreateRepCollectionEntryRequest = (ParsedCreateRepCollectionEntryFields & { error?: undefined }) | { error: NextResponse };

interface RawCreateRepCollectionEntryBody {
  orgPersonId?: unknown;
  company?: unknown;
  collectionType?: unknown;
  planFrom?: unknown;
  planTo?: unknown;
  amount?: unknown;
  occurredAt?: unknown;
  note?: unknown;
  sourceRawRecordId?: unknown;
}

/** Field-*shape* validation only — business rules (collection-type enum membership, `orgPersonId` actually existing in the org, amount positivity) live in `createRepCollectionEntry` (`rep-collection.service.ts`), the same split `parseCreateSegmentRequestBody` documents for its own sibling. */
export async function parseCreateRepCollectionEntryRequestBody(request: NextRequest): Promise<ParsedCreateRepCollectionEntryRequest> {
  const parsed = await parseJsonBody<RawCreateRepCollectionEntryBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const body = parsed.body;

  if (typeof body.company !== 'string' || body.company.trim().length === 0) {
    return invalid('company_required');
  }
  if (typeof body.collectionType !== 'string' || body.collectionType.trim().length === 0) {
    return invalid('collection_type_required');
  }
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
    return invalid('invalid_amount');
  }
  if (typeof body.occurredAt !== 'string' || body.occurredAt.trim().length === 0) {
    return invalid('occurred_at_required');
  }

  let orgPersonId: string | null = null;
  if (body.orgPersonId !== undefined && body.orgPersonId !== null) {
    if (typeof body.orgPersonId !== 'string' || body.orgPersonId.trim().length === 0) {
      return invalid('invalid_org_person_id');
    }
    orgPersonId = body.orgPersonId.trim();
  }

  return {
    orgPersonId,
    company: body.company,
    collectionType: body.collectionType.trim(),
    planFrom: typeof body.planFrom === 'string' ? body.planFrom : undefined,
    planTo: typeof body.planTo === 'string' ? body.planTo : undefined,
    amount: body.amount,
    occurredAt: body.occurredAt,
    note: typeof body.note === 'string' ? body.note : undefined,
    sourceRawRecordId: typeof body.sourceRawRecordId === 'string' ? body.sourceRawRecordId : undefined,
  };
}

export interface ParsedUpdateRepCollectionEntryFields {
  /** `undefined` when the request didn't touch the rep at all — distinct from `null`, which explicitly unassigns it. Same convention `parseUpdateSegmentWorkListRequestBody` uses for `ownerPersonId`. */
  orgPersonId?: string | null;
  amount?: number;
}

export type ParsedUpdateRepCollectionEntryRequest = (ParsedUpdateRepCollectionEntryFields & { error?: undefined }) | { error: NextResponse };

interface RawUpdateRepCollectionEntryBody {
  orgPersonId?: unknown;
  amount?: unknown;
}

/** At least one of `orgPersonId`/`amount` must be present so a no-op PATCH is rejected rather than silently doing nothing — same convention `parseUpdateSegmentWorkListRequestBody` establishes. */
export async function parseUpdateRepCollectionEntryRequestBody(request: NextRequest): Promise<ParsedUpdateRepCollectionEntryRequest> {
  const parsed = await parseJsonBody<RawUpdateRepCollectionEntryBody>(request);
  if (parsed.error) {
    return { error: parsed.error };
  }
  const body = parsed.body;

  const hasOrgPerson = Object.prototype.hasOwnProperty.call(body, 'orgPersonId');
  const hasAmount = Object.prototype.hasOwnProperty.call(body, 'amount');
  if (!hasOrgPerson && !hasAmount) {
    return invalid('no_fields_to_update');
  }

  const result: ParsedUpdateRepCollectionEntryFields = {};

  if (hasOrgPerson) {
    if (body.orgPersonId !== null && (typeof body.orgPersonId !== 'string' || body.orgPersonId.trim().length === 0)) {
      return invalid('invalid_org_person_id');
    }
    result.orgPersonId = body.orgPersonId === null ? null : (body.orgPersonId as string).trim();
  }

  if (hasAmount) {
    if (typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
      return invalid('invalid_amount');
    }
    result.amount = body.amount;
  }

  return result;
}
