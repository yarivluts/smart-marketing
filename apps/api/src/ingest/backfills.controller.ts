import { BadRequestException, Body, ConflictException, Controller, HttpCode, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { BackfillAlreadyFinishedError, BackfillNotFoundError, completeBackfill } from '@growthos/firebase-orm-models';
import { Public } from '../authz/public.decorator';
import { ApiKeyAuthGuard, type ApiKeyAuthenticatedRequest } from '../authz/api-key-auth.guard';
import { RequireApiKeyScope } from '../authz/api-key-scope.decorator';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** The integrator's completion report, validated. Exported for its unit test. */
export function parseBackfillCompletionBody(body: unknown): { status: 'completed' | 'failed'; recordsSent: number; batches: number; errors?: { message: string }[] } {
  if (!isPlainObject(body)) {
    throw new BadRequestException('Request body must be an object.');
  }
  const status = body.status ?? 'completed';
  if (status !== 'completed' && status !== 'failed') {
    throw new BadRequestException('status must be "completed" or "failed".');
  }
  const recordsSent = nonNegativeInteger(body.records_sent);
  const batches = nonNegativeInteger(body.batches);
  if (recordsSent === undefined || batches === undefined) {
    throw new BadRequestException('records_sent and batches must be non-negative integers.');
  }
  let errors: { message: string }[] | undefined;
  if (body.errors !== undefined) {
    if (!Array.isArray(body.errors)) {
      throw new BadRequestException('errors must be an array of { message }.');
    }
    errors = body.errors.map((entry) => ({ message: String(isPlainObject(entry) ? entry.message : entry).slice(0, 500) }));
  }
  return { status, recordsSent, batches, ...(errors ? { errors } : {}) };
}

/**
 * `POST /v1/backfills/{backfill_id}/complete`: the integrator reports that it finished resending
 * (or failed). Authenticated like ingest - an `ingest.write` key - and scoped to the key's own
 * environment, so a key from another environment cannot see or close the backfill.
 */
@Controller('backfills')
@Public()
@UseGuards(ApiKeyAuthGuard)
@RequireApiKeyScope('ingest.write')
export class BackfillsController {
  @Post(':backfillId/complete')
  @HttpCode(200)
  async complete(@Req() request: ApiKeyAuthenticatedRequest, @Param('backfillId') backfillId: string, @Body() body: unknown) {
    const context = request.apiKeyContext;
    if (!context) {
      throw new Error('ApiKeyAuthGuard did not populate apiKeyContext before the route handler ran.');
    }
    const report = parseBackfillCompletionBody(body);
    try {
      const updated = await completeBackfill({
        organizationId: context.organizationId,
        projectId: context.projectId,
        environmentId: context.environmentId,
        backfillId,
        ...report,
      });
      return { backfill_id: updated.id, status: updated.status };
    } catch (error) {
      if (error instanceof BackfillNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof BackfillAlreadyFinishedError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
