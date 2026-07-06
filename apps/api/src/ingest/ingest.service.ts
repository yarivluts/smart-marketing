import { Injectable } from '@nestjs/common';
import {
  getIngestBatch,
  ingestBatch,
  type IngestBatchDetail,
  type IngestBatchParams,
  type IngestBatchResult,
} from '@growthos/firebase-orm-models';

/** Thin injectable wrapper around `@growthos/firebase-orm-models`'s ingest service, so `IngestController` can be tested via Nest's DI/mocking instead of module-mocking the package. */
@Injectable()
export class IngestService {
  ingestBatch(params: IngestBatchParams): Promise<IngestBatchResult> {
    return ingestBatch(params);
  }

  getIngestBatch(
    organizationId: string,
    projectId: string,
    environmentId: string,
    batchId: string,
  ): Promise<IngestBatchDetail> {
    return getIngestBatch(organizationId, projectId, environmentId, batchId);
  }
}
