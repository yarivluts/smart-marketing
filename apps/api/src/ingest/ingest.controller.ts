import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  EmptyIngestBatchError,
  getIngestBatch,
  IngestBatchTooLargeError,
  ingestBatch,
  type IngestBatchInput,
} from '@growthos/firebase-orm-models';
import { Public } from '../authz/public.decorator';
import { ApiKeyAuthGuard, type ApiKeyAuthenticatedRequest } from '../authz/api-key-auth.guard';
import { RequireApiKeyScope } from '../authz/api-key-scope.decorator';
import { parseEntitiesRequestBody, parseEventsRequestBody, parseMeasuresRequestBody } from './ingest-request';

interface IngestBatchResponse {
  batch_id: string;
  kind: string;
  accepted: number;
  quarantined: number;
  duplicates: number;
  total: number;
}

/** `ApiKeyAuthGuard` always populates this before a route handler runs (it throws first if authentication fails), so a missing context here would mean the guard was bypassed, not a caller error. */
function requireApiKeyContext(request: ApiKeyAuthenticatedRequest) {
  if (!request.apiKeyContext) {
    throw new Error('ApiKeyAuthGuard did not populate apiKeyContext before the route handler ran.');
  }
  return request.apiKeyContext;
}

/** `POST /v1/ingest/(events|entities|measures)` + `GET /v1/ingest/batches/{batch_id}` (KAN-32, plan `12 §2.1`/`§2.2`). Authenticated by a bearer API key, not a human/service-account role binding — see `ApiKeyAuthGuard`. */
@Controller('ingest')
@Public()
@UseGuards(ApiKeyAuthGuard)
@RequireApiKeyScope('ingest.write')
export class IngestController {
  @Post('events')
  @HttpCode(202)
  ingestEvents(@Req() request: ApiKeyAuthenticatedRequest, @Body() body: unknown): Promise<IngestBatchResponse> {
    return this.handleBatch(request, parseEventsRequestBody(body));
  }

  @Post('entities')
  @HttpCode(202)
  ingestEntities(@Req() request: ApiKeyAuthenticatedRequest, @Body() body: unknown): Promise<IngestBatchResponse> {
    return this.handleBatch(request, parseEntitiesRequestBody(body));
  }

  @Post('measures')
  @HttpCode(202)
  ingestMeasures(@Req() request: ApiKeyAuthenticatedRequest, @Body() body: unknown): Promise<IngestBatchResponse> {
    return this.handleBatch(request, parseMeasuresRequestBody(body));
  }

  @Get('batches/:batchId')
  async getBatch(@Req() request: ApiKeyAuthenticatedRequest, @Param('batchId') batchId: string) {
    const context = requireApiKeyContext(request);
    const batch = await getIngestBatch(context.organizationId, context.projectId, context.environmentId, batchId);
    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }
    return {
      batch_id: batch.id,
      kind: batch.kind,
      total: batch.total_count,
      accepted: batch.accepted_count,
      quarantined: batch.quarantined_count,
      duplicates: batch.duplicate_count,
      created_at: batch.created_at,
      records: batch.record_results,
    };
  }

  private async handleBatch(request: ApiKeyAuthenticatedRequest, input: IngestBatchInput): Promise<IngestBatchResponse> {
    const context = requireApiKeyContext(request);
    try {
      const summary = await ingestBatch({
        organizationId: context.organizationId,
        projectId: context.projectId,
        environmentId: context.environmentId,
        input,
      });
      return {
        batch_id: summary.batchId,
        kind: summary.kind,
        accepted: summary.accepted,
        quarantined: summary.quarantined,
        duplicates: summary.duplicates,
        total: summary.total,
      };
    } catch (error) {
      if (error instanceof EmptyIngestBatchError || error instanceof IngestBatchTooLargeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
