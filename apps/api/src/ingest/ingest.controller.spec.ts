import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EmptyIngestBatchError, IngestBatchNotFoundError, InvalidIngestRecordError } from '@growthos/firebase-orm-models';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';

jest.mock('@growthos/firebase-orm-models', () => {
  const actual = jest.requireActual('@growthos/firebase-orm-models');
  return {
    ...actual,
    verifyApiKeyForRequest: jest.fn(),
  };
});

describe('IngestController', () => {
  let controller: IngestController;
  let ingestService: { ingestBatch: jest.Mock; getIngestBatch: jest.Mock };

  beforeEach(async () => {
    ingestService = { ingestBatch: jest.fn(), getIngestBatch: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [IngestController],
      providers: [{ provide: IngestService, useValue: ingestService }],
    }).compile();
    controller = moduleRef.get(IngestController);
  });

  const params = { organizationId: 'o1', projectId: 'p1', environmentId: 'e1' };

  it('ingests an events batch and returns the 202 response shape', async () => {
    ingestService.ingestBatch.mockResolvedValue({
      batchId: 'b1',
      kind: 'event',
      submitted: 1,
      accepted: 1,
      quarantined: 0,
      duplicate: 0,
      records: [],
    });

    const response = await controller.ingestEvents(params, {
      batch: [{ event_id: 'e-1', event: 'signup', properties: {} }],
    });

    expect(response).toEqual({ batch_id: 'b1', accepted: 1, quarantined: 0, duplicate: 0 });
    expect(ingestService.ingestBatch).toHaveBeenCalledWith({
      organizationId: 'o1',
      projectId: 'p1',
      environmentId: 'e1',
      kind: 'event',
      records: [{ clientRecordId: 'e-1', name: 'signup', data: {} }],
    });
  });

  it('ingests an entities batch, sharing the batch-level type across records', async () => {
    ingestService.ingestBatch.mockResolvedValue({
      batchId: 'b2',
      kind: 'entity',
      submitted: 1,
      accepted: 1,
      quarantined: 0,
      duplicate: 0,
      records: [],
    });

    await controller.ingestEntities(params, { type: 'product', records: [{ id: 'sku_1', attributes: {} }] });

    expect(ingestService.ingestBatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'entity', records: [{ clientRecordId: 'sku_1', name: 'product', data: {} }] }),
    );
  });

  it('ingests a measures batch', async () => {
    ingestService.ingestBatch.mockResolvedValue({
      batchId: 'b3',
      kind: 'measure',
      submitted: 1,
      accepted: 1,
      quarantined: 0,
      duplicate: 0,
      records: [],
    });

    await controller.ingestMeasures(params, {
      records: [{ measure: 'ad_spend', ts: '2026-07-02', dimensions: { channel: 'meta' }, value: 100 }],
    });

    expect(ingestService.ingestBatch).toHaveBeenCalledWith(expect.objectContaining({ kind: 'measure' }));
  });

  it('maps EmptyIngestBatchError and InvalidIngestRecordError to 400', async () => {
    ingestService.ingestBatch.mockRejectedValue(new EmptyIngestBatchError());
    await expect(controller.ingestEvents(params, { batch: [{ event_id: 'e-1', event: 'signup' }] })).rejects.toThrow(
      BadRequestException,
    );

    ingestService.ingestBatch.mockRejectedValue(new InvalidIngestRecordError('too many records'));
    await expect(controller.ingestEvents(params, { batch: [{ event_id: 'e-1', event: 'signup' }] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rethrows an unrecognized error from ingestBatch', async () => {
    ingestService.ingestBatch.mockRejectedValue(new Error('boom'));
    await expect(controller.ingestEvents(params, { batch: [{ event_id: 'e-1', event: 'signup' }] })).rejects.toThrow(
      'boom',
    );
  });

  it('returns per-record batch results on GET', async () => {
    ingestService.getIngestBatch.mockResolvedValue({
      batchId: 'b1',
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

    const response = await controller.getBatch({ ...params, batchId: 'b1' });
    expect(response).toEqual({
      batch_id: 'b1',
      kind: 'event',
      submitted: 1,
      accepted: 1,
      quarantined: 0,
      duplicate: 0,
      created_at: '2026-07-06T00:00:00.000Z',
      records: [{ client_record_id: 'e-1', name: 'signup', status: 'accepted', reasons: [] }],
    });
  });

  it('maps IngestBatchNotFoundError to 404', async () => {
    ingestService.getIngestBatch.mockRejectedValue(new IngestBatchNotFoundError());
    await expect(controller.getBatch({ ...params, batchId: 'missing' })).rejects.toThrow(NotFoundException);
  });
});
