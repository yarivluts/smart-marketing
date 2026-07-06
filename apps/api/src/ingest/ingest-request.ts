import { BadRequestException } from '@nestjs/common';
import type { IngestBatchInput } from '@growthos/firebase-orm-models';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Batch-level structural checks only (missing/malformed envelope -> 400).
 * Per-record problems (a bad `event_id`, an unregistered field, ...) are
 * deliberately not checked here — those quarantine just that one record
 * inside the 202 response, per plan `08 §2`'s "unknown fields are
 * quarantined, not dropped", rather than failing the whole request.
 */
export function parseEventsRequestBody(body: unknown): IngestBatchInput {
  if (!isPlainObject(body) || !Array.isArray(body.batch)) {
    throw new BadRequestException('Request body must be an object with a "batch" array.');
  }
  return { kind: 'event', records: body.batch };
}

export function parseEntitiesRequestBody(body: unknown): IngestBatchInput {
  if (!isPlainObject(body) || typeof body.type !== 'string' || body.type.trim().length === 0) {
    throw new BadRequestException('Request body must include a non-empty "type".');
  }
  if (!Array.isArray(body.records)) {
    throw new BadRequestException('Request body must be an object with a "records" array.');
  }
  return { kind: 'entity', type: body.type, records: body.records };
}

export function parseMeasuresRequestBody(body: unknown): IngestBatchInput {
  if (!isPlainObject(body) || !Array.isArray(body.records)) {
    throw new BadRequestException('Request body must be an object with a "records" array.');
  }
  return { kind: 'measure', records: body.records };
}
