import { BadRequestException } from '@nestjs/common';
import { MAX_INGEST_BATCH_SIZE, type IngestRecordInput } from '@growthos/firebase-orm-models';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`Every record must have a non-empty string "${field}".`);
  }
  return value.trim();
}

function dataObject(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (!isPlainObject(value)) {
    throw new BadRequestException(`"${field}" must be an object if present.`);
  }
  return value;
}

/** Rejects an oversized batch before doing any per-record parsing work, not just in the service layer after the fact. */
function requireBatchWithinSizeLimit(records: unknown[]): void {
  if (records.length > MAX_INGEST_BATCH_SIZE) {
    throw new BadRequestException(`A batch may contain at most ${MAX_INGEST_BATCH_SIZE} records.`);
  }
}

// Bounds the cost of `stableStringify` on a maliciously deep `dimensions`
// object — well below JS's real call-stack limit, so this throws a clean,
// cheap error instead of paying for the recursion first and then crashing
// with an uncaught RangeError (which would surface as a bare 500).
const MAX_STABLE_STRINGIFY_DEPTH = 20;

/** Deterministic JSON serialization (sorted object keys) so the same measure tuple always derives the same idempotency key. */
function stableStringify(value: unknown, depth = 0): string {
  if (depth > MAX_STABLE_STRINGIFY_DEPTH) {
    throw new BadRequestException('"dimensions" is nested too deeply.');
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry, depth + 1)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key], depth + 1)}`).join(',')}}`;
}

/** `POST /v1/.../ingest/events` body: `{ batch: [{ event_id, event, ts, identities?, context?, properties? }] }`. */
export function parseEventsBody(body: unknown): IngestRecordInput[] {
  if (!isPlainObject(body) || !Array.isArray(body.batch)) {
    throw new BadRequestException('Body must be an object with a "batch" array.');
  }
  requireBatchWithinSizeLimit(body.batch);
  return body.batch.map((rawRecord) => {
    if (!isPlainObject(rawRecord)) {
      throw new BadRequestException('Every entry in "batch" must be an object.');
    }
    return {
      clientRecordId: requireNonEmptyString(rawRecord.event_id, 'event_id'),
      name: requireNonEmptyString(rawRecord.event, 'event'),
      data: dataObject(rawRecord.properties, 'properties'),
      raw: rawRecord,
    };
  });
}

/** `POST /v1/.../ingest/entities` body: `{ type, records: [{ id, attributes? }] }` — one shared entity type per batch. */
export function parseEntitiesBody(body: unknown): IngestRecordInput[] {
  if (!isPlainObject(body) || !Array.isArray(body.records)) {
    throw new BadRequestException('Body must be an object with a "records" array.');
  }
  requireBatchWithinSizeLimit(body.records);
  const type = requireNonEmptyString(body.type, 'type');
  return body.records.map((rawRecord) => {
    if (!isPlainObject(rawRecord)) {
      throw new BadRequestException('Every entry in "records" must be an object.');
    }
    return {
      clientRecordId: requireNonEmptyString(rawRecord.id, 'id'),
      name: type,
      data: dataObject(rawRecord.attributes, 'attributes'),
      raw: { ...rawRecord, type },
    };
  });
}

/**
 * `POST /v1/.../ingest/measures` body: `{ records: [{ measure, ts, dimensions?, value, currency? }] }`. Unlike
 * events/entities, the plan's measure shape has no client-supplied id — a
 * measure is a point-in-time aggregate, not a discrete client action — so
 * the idempotency key is derived from the tuple that defines "the same
 * measurement": its name, timestamp, and dimensions.
 */
export function parseMeasuresBody(body: unknown): IngestRecordInput[] {
  if (!isPlainObject(body) || !Array.isArray(body.records)) {
    throw new BadRequestException('Body must be an object with a "records" array.');
  }
  requireBatchWithinSizeLimit(body.records);
  return body.records.map((rawRecord) => {
    if (!isPlainObject(rawRecord)) {
      throw new BadRequestException('Every entry in "records" must be an object.');
    }
    const measure = requireNonEmptyString(rawRecord.measure, 'measure');
    const ts = requireNonEmptyString(rawRecord.ts, 'ts');
    const dimensions = dataObject(rawRecord.dimensions, 'dimensions');
    return {
      clientRecordId: stableStringify({ measure, ts, dimensions }),
      name: measure,
      data: dimensions,
      raw: rawRecord,
    };
  });
}
