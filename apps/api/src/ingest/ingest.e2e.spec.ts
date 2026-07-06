import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { verifyApiKeyForRequest } from '@growthos/firebase-orm-models';
import { AppModule } from '../app.module';
import { IngestService } from './ingest.service';

jest.mock('@growthos/firebase-orm-models', () => {
  const actual = jest.requireActual('@growthos/firebase-orm-models');
  return { ...actual, verifyApiKeyForRequest: jest.fn() };
});

const mockedVerify = verifyApiKeyForRequest as jest.MockedFunction<typeof verifyApiKeyForRequest>;

describe('Ingest API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let ingestService: { ingestBatch: jest.Mock; getIngestBatch: jest.Mock };

  beforeAll(async () => {
    ingestService = { ingestBatch: jest.fn(), getIngestBatch: jest.fn() };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IngestService)
      .useValue(ingestService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockedVerify.mockReset();
    ingestService.ingestBatch.mockReset();
    ingestService.getIngestBatch.mockReset();
  });

  const ingestUrl = `/v1/orgs/o1/projects/p1/environments/e1/ingest/events`;

  it('rejects a request with no Authorization header (401), never reaching the service', async () => {
    const res = await fetch(`${baseUrl}${ingestUrl}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ batch: [{ event_id: 'e-1', event: 'signup' }] }),
    });
    expect(res.status).toBe(401);
    expect(ingestService.ingestBatch).not.toHaveBeenCalled();
  });

  it('rejects an invalid/wrong-scope key (403)', async () => {
    mockedVerify.mockResolvedValue({ ok: false, error: 'Invalid API key.' });
    const res = await fetch(`${baseUrl}${ingestUrl}`, {
      method: 'POST',
      headers: { authorization: 'Bearer gos_test_bad', 'content-type': 'application/json' },
      body: JSON.stringify({ batch: [{ event_id: 'e-1', event: 'signup' }] }),
    });
    expect(res.status).toBe(403);
    expect(ingestService.ingestBatch).not.toHaveBeenCalled();
  });

  it('accepts a valid key and returns 202 with the batch summary', async () => {
    mockedVerify.mockResolvedValue({
      ok: true,
      value: { apiKey: {} as never, organizationId: 'o1', projectId: 'p1', environmentId: 'e1', scopes: ['ingest.write'] },
    });
    ingestService.ingestBatch.mockResolvedValue({
      batchId: 'b_789',
      kind: 'event',
      submitted: 1,
      accepted: 1,
      quarantined: 0,
      duplicate: 0,
      records: [],
    });

    const res = await fetch(`${baseUrl}${ingestUrl}`, {
      method: 'POST',
      headers: { authorization: 'Bearer gos_test_good', 'content-type': 'application/json' },
      body: JSON.stringify({ batch: [{ event_id: 'e-1', event: 'signup', properties: {} }] }),
    });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ batch_id: 'b_789', accepted: 1, quarantined: 0, duplicate: 0 });
  });

  it('rejects a malformed body with 400, after authenticating', async () => {
    mockedVerify.mockResolvedValue({
      ok: true,
      value: { apiKey: {} as never, organizationId: 'o1', projectId: 'p1', environmentId: 'e1', scopes: ['ingest.write'] },
    });

    const res = await fetch(`${baseUrl}${ingestUrl}`, {
      method: 'POST',
      headers: { authorization: 'Bearer gos_test_good', 'content-type': 'application/json' },
      body: JSON.stringify({ notBatch: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('serves per-record results on GET /ingest/batches/:batchId', async () => {
    mockedVerify.mockResolvedValue({
      ok: true,
      value: { apiKey: {} as never, organizationId: 'o1', projectId: 'p1', environmentId: 'e1', scopes: ['ingest.write'] },
    });
    ingestService.getIngestBatch.mockResolvedValue({
      batchId: 'b_789',
      organizationId: 'o1',
      projectId: 'p1',
      environmentId: 'e1',
      kind: 'event',
      submitted: 1,
      accepted: 1,
      quarantined: 0,
      duplicate: 0,
      createdAt: '2026-07-06T00:00:00.000Z',
      records: [{ clientRecordId: 'e-1', name: 'signup', status: 'accepted', reasons: [] }],
    });

    const res = await fetch(`${baseUrl}/v1/orgs/o1/projects/p1/environments/e1/ingest/batches/b_789`, {
      headers: { authorization: 'Bearer gos_test_good' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batch_id: string; records: unknown[] };
    expect(body.batch_id).toBe('b_789');
    expect(body.records).toHaveLength(1);
  });
});
