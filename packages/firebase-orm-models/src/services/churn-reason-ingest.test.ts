import { describe, expect, it, vi } from 'vitest';
import {
  ingestCancellationReasonFeedback,
  getCancellationReasonFeedForProject,
} from './churn-reason.service';
import * as schemaRegistry from './schema-registry.service';
import * as ingestService from './ingest.service';
import * as pipelineService from './pipeline.service';
import { ProjectModel } from '../models/project.model';
import type { RawRecordModel } from '../models/raw-record.model';

describe('churn-reason-ingest service', () => {
  it('ingests cancellation reason feedback and ensures schema registration', async () => {
    vi.spyOn(ProjectModel, 'init').mockResolvedValue({
      id: 'proj_123',
      organization_id: 'org_123',
    } as any);

    const ensureSchemaSpy = vi.spyOn(schemaRegistry, 'getActiveSchemaDefinition').mockResolvedValue({
      id: 'schema_1',
      name: 'cancellation_reason',
      kind: 'event',
    } as any);

    const ingestBatchSpy = vi.spyOn(ingestService, 'ingestBatch').mockResolvedValue({
      batchId: 'batch_test_1',
      kind: 'event',
      total: 2,
      accepted: 2,
      quarantined: 0,
      duplicates: 0,
    });

    const result = await ingestCancellationReasonFeedback({
      organizationId: 'org_123',
      projectId: 'proj_123',
      environmentId: 'prod',
      feedback: [
        {
          reasonCode: 'too_expensive',
          comment: 'Too pricey for our budget right now',
          customerId: 'cus_abc',
        },
        {
          reasonCode: 'switched_competitor',
          comment: 'Went to Competitor X',
          customerId: 'cus_xyz',
        },
      ],
    });

    expect(result.accepted).toBe(2);
    expect(result.quarantined).toBe(0);
    expect(result.batchId).toBe('batch_test_1');
    expect(ingestBatchSpy).toHaveBeenCalledTimes(1);

    const callArgs = ingestBatchSpy.mock.calls[0][0];
    expect(callArgs.organizationId).toBe('org_123');
    expect(callArgs.projectId).toBe('proj_123');
    expect(callArgs.environmentId).toBe('prod');
    expect(callArgs.input.kind).toBe('event');
    expect((callArgs.input as any).records).toHaveLength(2);
    expect((callArgs.input as any).records[0].payload.properties.reason_code).toBe('too_expensive');
    expect((callArgs.input as any).records[0].payload.properties.comment).toBe('Too pricey for our budget right now');
    expect((callArgs.input as any).records[0].payload.properties.customer_id).toBe('cus_abc');
  });

  it('parses raw records and computes winback assessments for feed items', async () => {
    vi.spyOn(ProjectModel, 'init').mockResolvedValue({
      id: 'proj_123',
      organization_id: 'org_123',
    } as any);

    const mockRecords: Partial<RawRecordModel>[] = [
      {
        id: 'rec_1',
        client_id: 'client_1',
        landed_at: '2026-10-09T10:00:00.000Z',
        payload: {
          properties: {
            reason_code: 'too_expensive',
            comment: 'Tight Q4 budget',
            customer_id: 'cus_1',
          },
        },
      },
      {
        id: 'rec_2',
        client_id: 'client_2',
        landed_at: '2026-10-09T09:00:00.000Z',
        payload: {
          properties: {
            reason_code: 'not_using_enough',
            customer_id: 'cus_2',
          },
        },
      },
    ];

    const feed = await getCancellationReasonFeedForProject('org_123', 'proj_123', {
      precomputedRecords: mockRecords as RawRecordModel[],
    });

    expect(feed).toHaveLength(2);
    expect(feed[0].reasonCode).toBe('too_expensive');
    expect(feed[0].comment).toBe('Tight Q4 budget');
    expect(feed[0].customerId).toBe('cus_1');
    expect(feed[0].winback.recommendedPlaybook).toBe('pause_discount');
    expect(feed[0].winback.potential).toBe('high');

    expect(feed[1].reasonCode).toBe('not_using_enough');
    expect(feed[1].comment).toBeNull();
    expect(feed[1].customerId).toBe('cus_2');
    expect(feed[1].winback.recommendedPlaybook).toBe('adoption_concierge');
  });
});
