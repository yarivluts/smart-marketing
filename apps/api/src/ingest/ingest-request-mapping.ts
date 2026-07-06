import { BadRequestException } from '@nestjs/common';
import type { IngestRecordInput } from '@growthos/firebase-orm-models';

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

/** Deterministic JSON serialization (sorted object keys) so the same measure tuple always derives the same idempotency key. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

/** `POST /v1/.../ingest/events` body: `{ batch: [{ event_id, event, ts, identities?, context?, properties? }] }`. */
export function parseEventsBody(body: unknown): IngestRecordInput[] {
  if (!isPlainObject(body) || !Array.isArray(body.batch)) {
    throw new BadRequestException('Body must be an object with a "batch" array.');
  }
  return body.batch.map((rawRecord) => {
    if (!isPlainObject(rawRecord)) {
      throw new BadRequestException('Every entry in "batch" must be an object.');
    }
    return {
      clientRecordId: requireNonEmptyString(rawRecord.event_id, 'event_id'),
      name: requireNonEmptyString(rawRecord.event, 'event'),
      data: dataObject(rawRecord.properties, 'properties'),
    };
  });
}

/** `POST /v1/.../ingest/entities` body: `{ type, records: [{ id, attributes? }] }` — one shared entity type per batch. */
export function parseEntitiesBody(body: unknown): IngestRecordInput[] {
  if (!isPlainObject(body) || !Array.isArray(body.records)) {
    throw new BadRequestException('Body must be an object with a "records" array.');
  }
  const type = requireNonEmptyString(body.type, 'type');
  return body.records.map((rawRecord) => {
    if (!isPlainObject(rawRecord)) {
      throw new BadRequestException('Every entry in "records" must be an object.');
    }
    return {
      clientRecordId: requireNonEmptyString(rawRecord.id, 'id'),
      name: type,
      data: dataObject(rawRecord.attributes, 'attributes'),
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
    };
  });
}
