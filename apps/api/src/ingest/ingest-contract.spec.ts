import { checkRecordEnvelope, IMPLICIT_EVENT_ENVELOPE_FIELDS, MAX_INGEST_BATCH_SIZE } from '@growthos/firebase-orm-models';
import { parseEntitiesRequestBody, parseEventsRequestBody, parseMeasuresRequestBody } from './ingest-request';
import { buildIngestContract, INGEST_CONTRACT_RULES } from './ingest-contract';

/**
 * KAN-202 I1: the published contract must describe what ingest actually does. Each check below
 * holds the document against the real code path, so changing ingest without the contract (or the
 * contract without ingest) fails here rather than in an integrator's quarantine.
 */
const contract = buildIngestContract('https://api.example.test/');
const schemas = contract.components.schemas;

/** The fields `checkRecordEnvelope` insists on, read from the reasons it gives an empty record. */
function envelopeRequiredFields(kind: 'event' | 'entity' | 'measure'): string[] {
  return checkRecordEnvelope(kind, {})
    .envelopeReasons.map((reason) => reason.replace(/^missing_field:/, ''))
    .sort();
}

describe('ingest contract (KAN-202 I1)', () => {
  it('is an OpenAPI 3.1 document served under the deployment-configured /v1 base', () => {
    expect(contract.openapi).toBe('3.1.0');
    expect(contract.servers).toEqual([{ url: 'https://api.example.test/v1' }]);
    expect(Object.keys(contract.paths).sort()).toEqual(['/ingest/batches/{batch_id}', '/ingest/entities', '/ingest/events', '/ingest/measures']);
  });

  it.each([
    ['event', schemas.EventRecord],
    ['entity', schemas.EntityRecord],
    ['measure', schemas.MeasureRecord],
  ] as const)('%s records: required fields are exactly the ones ingest rejects when missing', (kind, schema) => {
    expect([...schema.required].sort()).toEqual(envelopeRequiredFields(kind));
  });

  it.each([
    ['event', schemas.EventRecord],
    ['entity', schemas.EntityRecord],
    ['measure', schemas.MeasureRecord],
  ] as const)('every %s example passes the real envelope check', (kind, schema) => {
    for (const example of schema.examples) {
      expect(checkRecordEnvelope(kind, example as Record<string, unknown>).envelopeReasons).toEqual([]);
    }
  });

  it('every request example parses as the endpoint it documents', () => {
    const example = (path: '/ingest/events' | '/ingest/entities' | '/ingest/measures') => contract.paths[path].post.requestBody.content['application/json'].example;
    expect(parseEventsRequestBody(example('/ingest/events')).kind).toBe('event');
    expect(parseEntitiesRequestBody(example('/ingest/entities')).kind).toBe('entity');
    expect(parseMeasuresRequestBody(example('/ingest/measures')).kind).toBe('measure');
  });

  it('documents the batch limit ingest enforces', () => {
    expect(contract['x-growthos-limits'].max_records_per_batch).toBe(MAX_INGEST_BATCH_SIZE);
    const eventsBody = contract.paths['/ingest/events'].post.requestBody.content['application/json'].schema as { properties: Record<string, unknown> };
    expect(eventsBody.properties.batch).toMatchObject({ maxItems: MAX_INGEST_BATCH_SIZE, minItems: 1 });
  });

  it('puts identity inside properties, as the implicitly accepted event fields', () => {
    const eventProperties = schemas.EventRecord.properties.properties.properties;
    expect(Object.keys(eventProperties).sort()).toEqual([...IMPLICIT_EVENT_ENVELOPE_FIELDS].sort());
    // Not a top-level record field: that is where EasySign first put them, and ingest ignores them there.
    for (const field of IMPLICIT_EVENT_ENVELOPE_FIELDS) {
      expect(schemas.EventRecord.properties).not.toHaveProperty(field);
    }
    expect(schemas.EventRecord.examples[0].properties).toMatchObject({ anon_id: expect.any(String) });
  });

  it('states the rules integrators learned the hard way', () => {
    expect(INGEST_CONTRACT_RULES.map((rule) => rule.id)).toEqual(
      expect.arrayContaining(['identity_inside_properties', 'ts_is_source_time', 'touchpoint_first_event_of_visit', 'entity_upsert_whole_row']),
    );
    expect(contract['x-growthos-rules']).toBe(INGEST_CONTRACT_RULES);
  });
});
