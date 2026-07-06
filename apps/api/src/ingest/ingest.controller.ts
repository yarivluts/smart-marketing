import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import {
  EmptyIngestBatchError,
  IngestBatchNotFoundError,
  InvalidIngestRecordError,
  type IngestBatchResult,
  type IngestRecordInput,
  type SchemaDefKind,
} from '@growthos/firebase-orm-models';
import { Public } from '../authz/public.decorator';
import { IngestApiKeyGuard } from './ingest-api-key.guard';
import { IngestService } from './ingest.service';
import { parseEntitiesBody, parseEventsBody, parseMeasuresBody } from './ingest-request-mapping';

interface IngestPathParams {
  organizationId: string;
  projectId: string;
  environmentId: string;
}

interface IngestBatchResponseBody {
  batch_id: string;
  accepted: number;
  quarantined: number;
  duplicate: number;
}

function toBatchResponse(result: IngestBatchResult): IngestBatchResponseBody {
  return {
    batch_id: result.batchId,
    accepted: result.accepted,
    quarantined: result.quarantined,
    duplicate: result.duplicate,
  };
}

/**
 * `POST /v1/orgs/:organizationId/projects/:projectId/environments/:environmentId/ingest/(events|entities|measures)`
 * (KAN-32: plan `13 §E3.2`/`12 §2`). The plan's own curl example
 * (`12 §2.1`) shows a bare `/v1/ingest/events` — this route nests the
 * org/project/environment in the path instead, because
 * `verifyApiKeyForRequest` (KAN-28) authenticates a key *against* an
 * expected org/project/environment rather than deriving one from the key
 * alone (the key is looked up purely by hash); nesting the path is what
 * supplies that expected context without changing KAN-28's service.
 *
 * Authenticated by `IngestApiKeyGuard`, not `PermissionGuard` — an API key
 * has no role binding to check, so every route here is `@Public()` (to
 * satisfy `PermissionGuard`'s deny-by-default check and its lint rule) and
 * gated instead by the API-key guard.
 */
@Controller('orgs/:organizationId/projects/:projectId/environments/:environmentId/ingest')
@Public()
@UseGuards(IngestApiKeyGuard)
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('events')
  @HttpCode(202)
  ingestEvents(@Param() params: IngestPathParams, @Body() body: unknown): Promise<IngestBatchResponseBody> {
    return this.submit(params, 'event', parseEventsBody(body));
  }

  @Post('entities')
  @HttpCode(202)
  ingestEntities(@Param() params: IngestPathParams, @Body() body: unknown): Promise<IngestBatchResponseBody> {
    return this.submit(params, 'entity', parseEntitiesBody(body));
  }

  @Post('measures')
  @HttpCode(202)
  ingestMeasures(@Param() params: IngestPathParams, @Body() body: unknown): Promise<IngestBatchResponseBody> {
    return this.submit(params, 'measure', parseMeasuresBody(body));
  }

  @Get('batches/:batchId')
  async getBatch(@Param() params: IngestPathParams & { batchId: string }) {
    try {
      const detail = await this.ingestService.getIngestBatch(
        params.organizationId,
        params.projectId,
        params.environmentId,
        params.batchId,
      );
      return {
        batch_id: detail.batchId,
        kind: detail.kind,
        submitted: detail.submitted,
        accepted: detail.accepted,
        quarantined: detail.quarantined,
        duplicate: detail.duplicate,
        created_at: detail.createdAt,
        records: detail.records.map((record) => ({
          client_record_id: record.clientRecordId,
          name: record.name,
          status: record.status,
          reasons: record.reasons,
        })),
      };
    } catch (error) {
      if (error instanceof IngestBatchNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  private async submit(
    params: IngestPathParams,
    kind: SchemaDefKind,
    records: IngestRecordInput[],
  ): Promise<IngestBatchResponseBody> {
    try {
      const result = await this.ingestService.ingestBatch({
        organizationId: params.organizationId,
        projectId: params.projectId,
        environmentId: params.environmentId,
        kind,
        records,
      });
      return toBatchResponse(result);
    } catch (error) {
      if (error instanceof EmptyIngestBatchError || error instanceof InvalidIngestRecordError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
