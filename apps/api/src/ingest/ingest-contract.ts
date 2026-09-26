import { IMPLICIT_EVENT_ENVELOPE_FIELDS, MAX_INGEST_BATCH_SIZE } from '@growthos/firebase-orm-models';

/**
 * The machine-readable ingest contract (KAN-202 I1): an OpenAPI 3.1 document for
 * `POST /v1/ingest/(events|entities|measures)` and `GET /v1/ingest/batches/{batch_id}`, served
 * unauthenticated at `GET /v1/ingest/contract`.
 *
 * The first integrator (EasySign) found the request envelope by probing for 404s and learned the
 * semantic rules - where identity goes, what `ts` means, how entity upserts land - one quarantined
 * batch at a time. Everything here is built from the constants ingest itself enforces
 * (`MAX_INGEST_BATCH_SIZE`, `IMPLICIT_EVENT_ENVELOPE_FIELDS`), and `ingest-contract.spec.ts` checks
 * every required field and every example against the real envelope validation
 * (`checkRecordEnvelope`), so the document cannot promise something ingest does not do.
 *
 * Per-project field schemas are not in this document: they live in the project's schema registry
 * (`list_schemas`), and a record's `properties`/`attributes`/`dimensions` are checked against them.
 */

/** The rules a correct integration follows that a JSON shape alone cannot express. */
export const INGEST_CONTRACT_RULES: readonly { id: string; rule: string }[] = [
  {
    id: 'identity_inside_properties',
    rule: `Identity goes INSIDE properties: send ${IMPLICIT_EVENT_ENVELOPE_FIELDS.map((field) => `properties.${field}`).join(' and ')} (strings), not as top-level record fields. Both are accepted on every event schema without being declared; declare them with is_identity_key only if they should take part in identity stitching.`,
  },
  {
    id: 'ts_is_source_time',
    rule: 'ts is when the event happened at the source (ISO 8601), not when a relay or queue received or forwarded it. Time-bucketed reports, funnels and attribution windows all read ts.',
  },
  {
    id: 'touchpoint_first_event_of_visit',
    rule: 'The touchpoint event is the first event of a visit: send it once per visit, before the visit\'s other events, carrying landing_page, referrer, the utm_* parameters and click_id when present. Attribution credits the touchpoint, so a touchpoint sent later in the visit (or once per page view) misattributes it.',
  },
  {
    id: 'entity_upsert_whole_row',
    rule: 'An entity record is an upsert of the WHOLE row: send every attribute each time, not just the changed ones. Each record with changed attributes lands as a new version and the latest version wins; resending identical attributes is a duplicate and is not stored again.',
  },
  {
    id: 'event_id_is_idempotency_key',
    rule: 'event_id is the idempotency key: a retried event with the same event_id in the same environment is reported as a duplicate, not counted twice. Use a stable id from the source, never a per-attempt random value.',
  },
  {
    id: 'unregistered_fields_quarantine',
    rule: 'Every key in properties / attributes / dimensions must be declared on the registered schema (list_schemas). An undeclared key, a missing required field or a wrong type quarantines that one record; the rest of the batch is still accepted. The 202 response lists each rejected record with its reasons.',
  },
  {
    id: 'environment_from_key',
    rule: 'The environment (dev, staging, prod) is the one the API key was minted for. It is never a field in the payload; send test traffic with a dev key.',
  },
];

const EVENT_EXAMPLE = {
  event_id: 'evt_01J9ZK4Q8M',
  event: 'signup',
  ts: '2026-09-25T16:12:04Z',
  properties: { anon_id: 'c9b3bb0d-5f35-42b3-9a9f-d4fde84e50a7', customer_id: 'cus_123', plan: 'free' },
};

const ENTITY_EXAMPLE = { id: 'cus_123', attributes: { email: 'someone@example.com', plan: 'pro', country: 'IL' } };

const MEASURE_EXAMPLE = { measure: 'ad_spend', ts: '2026-09-25T00:00:00Z', value: 125.5, dimensions: { channel: 'google', campaign_id: 'cmp_42' } };

const RECORD_RESULT_SCHEMA = {
  type: 'object',
  required: ['client_id', 'status'],
  properties: {
    client_id: { type: 'string', description: "The record's own id (event_id, entity id, or a measure's name|ts|dimensions key)." },
    status: { type: 'string', enum: ['accepted', 'quarantined', 'duplicate'] },
    reasons: { type: 'array', items: { type: 'string' }, description: 'Why a record was quarantined, e.g. missing_field:ts, unregistered_field:plan, field_type_mismatch:amount, schema_not_registered.' },
  },
};

function batchSchema(recordsKey: 'batch' | 'records', record: object, extra: Record<string, object> = {}, extraRequired: string[] = []) {
  return {
    type: 'object',
    required: [...extraRequired, recordsKey],
    properties: {
      ...extra,
      [recordsKey]: { type: 'array', minItems: 1, maxItems: MAX_INGEST_BATCH_SIZE, items: record },
    },
  };
}

const EVENT_RECORD_SCHEMA = {
  type: 'object',
  required: ['event_id', 'event', 'ts'],
  properties: {
    event_id: { type: 'string', minLength: 1, description: 'Stable id from the source; the idempotency key.' },
    event: { type: 'string', minLength: 1, description: 'The registered event schema name.' },
    ts: { type: 'string', format: 'date-time', description: 'When it happened at the source.' },
    properties: {
      type: 'object',
      description: `Fields declared on the event schema, plus ${IMPLICIT_EVENT_ENVELOPE_FIELDS.join(' and ')} (always allowed, strings).`,
      properties: Object.fromEntries(IMPLICIT_EVENT_ENVELOPE_FIELDS.map((field) => [field, { type: 'string' }])),
      additionalProperties: true,
    },
  },
  examples: [EVENT_EXAMPLE],
};

const ENTITY_RECORD_SCHEMA = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1, description: "The row's id, unique within the entity type." },
    attributes: { type: 'object', description: 'The WHOLE row: every attribute declared on the entity schema.', additionalProperties: true },
  },
  examples: [ENTITY_EXAMPLE],
};

const MEASURE_RECORD_SCHEMA = {
  type: 'object',
  required: ['measure', 'ts', 'value'],
  properties: {
    measure: { type: 'string', minLength: 1, description: 'The registered measure schema name.' },
    ts: { type: 'string', format: 'date-time', description: 'The start of the period the value covers.' },
    value: { type: 'number' },
    dimensions: { type: 'object', description: 'Fields declared on the measure schema.', additionalProperties: true },
  },
  examples: [MEASURE_EXAMPLE],
};

const BATCH_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['batch_id', 'kind', 'accepted', 'quarantined', 'duplicates', 'total'],
  properties: {
    batch_id: { type: 'string' },
    kind: { type: 'string', enum: ['event', 'entity', 'measure'] },
    accepted: { type: 'integer' },
    quarantined: { type: 'integer' },
    duplicates: { type: 'integer' },
    total: { type: 'integer' },
    rejected: { type: 'array', items: RECORD_RESULT_SCHEMA, description: 'Present only when a record was not accepted.' },
  },
};

function ingestOperation(summary: string, requestSchema: object, example: object) {
  return {
    summary,
    security: [{ apiKey: [] }],
    requestBody: { required: true, content: { 'application/json': { schema: requestSchema, example } } },
    responses: {
      '202': { description: 'Batch received. Each record is accepted, quarantined or a duplicate on its own.', content: { 'application/json': { schema: BATCH_RESPONSE_SCHEMA } } },
      '400': { description: `Malformed envelope, an empty batch, or more than ${MAX_INGEST_BATCH_SIZE} records.` },
      '401': { description: 'Missing, unknown or revoked API key.' },
      '403': { description: 'The API key is not allowed here, e.g. it does not carry the ingest.write scope.' },
    },
  };
}

export function buildIngestContract(apiBaseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'GrowthOS ingest API',
      version: '1',
      description:
        'Send events, entities and measures to one project environment. Field-level schemas are per project: read them with the list_schemas MCP tool or the Schemas page. The rules in x-growthos-rules are part of the contract.',
    },
    servers: [{ url: `${apiBaseUrl.replace(/\/+$/, '')}/v1` }],
    'x-growthos-rules': INGEST_CONTRACT_RULES,
    'x-growthos-limits': { max_records_per_batch: MAX_INGEST_BATCH_SIZE },
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', description: 'A project API key (gos_live_... / gos_test_...) with the ingest.write scope, bound to one environment.' },
      },
      schemas: {
        EventRecord: EVENT_RECORD_SCHEMA,
        EntityRecord: ENTITY_RECORD_SCHEMA,
        MeasureRecord: MEASURE_RECORD_SCHEMA,
        BatchResponse: BATCH_RESPONSE_SCHEMA,
        RecordResult: RECORD_RESULT_SCHEMA,
      },
    },
    paths: {
      '/ingest/events': {
        post: ingestOperation('Send a batch of events', batchSchema('batch', EVENT_RECORD_SCHEMA), { batch: [EVENT_EXAMPLE] }),
      },
      '/ingest/entities': {
        post: ingestOperation(
          'Upsert a batch of entities of one type',
          batchSchema('records', ENTITY_RECORD_SCHEMA, { type: { type: 'string', minLength: 1, description: 'The registered entity schema name.' } }, ['type']),
          { type: 'customer', records: [ENTITY_EXAMPLE] },
        ),
      },
      '/ingest/measures': {
        post: ingestOperation('Send a batch of pre-aggregated measures', batchSchema('records', MEASURE_RECORD_SCHEMA), { records: [MEASURE_EXAMPLE] }),
      },
      '/ingest/batches/{batch_id}': {
        get: {
          summary: "One batch's per-record results, in the key's own environment",
          security: [{ apiKey: [] }],
          parameters: [{ name: 'batch_id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'The batch and every record result.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { ...BATCH_RESPONSE_SCHEMA.properties, created_at: { type: 'string' }, records: { type: 'array', items: RECORD_RESULT_SCHEMA } },
                  },
                },
              },
            },
            '404': { description: 'No such batch in this project environment.' },
          },
        },
      },
    },
  };
}
