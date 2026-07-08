import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  getMetricCatalogDetail,
  listMetricsCatalogForProject,
  MetricNotRegisteredError,
  ProjectNotFoundError,
  ProjectQueryQuotaExceededError,
  queryMetrics,
  WarehouseNotConfiguredError,
} from '@growthos/firebase-orm-models';
import { MetricCompilerError } from '@growthos/shared';
import { Public } from '../authz/public.decorator';
import { ApiKeyAuthGuard, type ApiKeyAuthenticatedRequest } from '../authz/api-key-auth.guard';
import { RequireApiKeyScope } from '../authz/api-key-scope.decorator';
import { parseMetricQueryRequestBody } from './metrics-request';

/** See `requireApiKeyContext` in `ingest.controller.ts` for why this throws (a programmer error, not a caller-facing one) rather than returning a nullable value every route would then need to re-check. */
function requireApiKeyContext(request: ApiKeyAuthenticatedRequest) {
  if (!request.apiKeyContext) {
    throw new Error('ApiKeyAuthGuard did not populate apiKeyContext before the route handler ran.');
  }
  return request.apiKeyContext;
}

/**
 * `POST /v1/metrics/query` + `GET /v1/metrics` + `GET /v1/metrics/{name}`
 * (KAN-42, plan `12 §3`). Authenticated the same way as `IngestController` —
 * a bearer API key, not a human/service-account role binding. There is no
 * separate `metrics.read` permission in the catalog (plan `08 §5.3` lists
 * only `metrics.write`), so `metrics.write` doubles as the machine scope for
 * the whole metrics surface — defining *and* querying — the same flat
 * catalog the plan itself uses.
 */
@Controller('metrics')
@Public()
@UseGuards(ApiKeyAuthGuard)
@RequireApiKeyScope('metrics.write')
export class MetricsController {
  @Post('query')
  async query(@Req() request: ApiKeyAuthenticatedRequest, @Body() body: unknown) {
    const context = requireApiKeyContext(request);
    const parsedRequest = parseMetricQueryRequestBody(body);

    try {
      const result = await queryMetrics({ organizationId: context.organizationId, projectId: context.projectId, request: parsedRequest });
      return { series: result.series, definition_refs: result.definitionRefs, cache_hit: result.cacheHit };
    } catch (error) {
      if (error instanceof ProjectNotFoundError) {
        throw new NotFoundException('Project not found.');
      }
      if (error instanceof MetricNotRegisteredError || error instanceof MetricCompilerError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof WarehouseNotConfiguredError) {
        throw new ServiceUnavailableException(error.message);
      }
      if (error instanceof ProjectQueryQuotaExceededError) {
        throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw error;
    }
  }

  @Get()
  async catalog(@Req() request: ApiKeyAuthenticatedRequest) {
    const context = requireApiKeyContext(request);
    const metrics = await listMetricsCatalogForProject(context.organizationId, context.projectId);
    return { metrics };
  }

  @Get(':name')
  async definition(@Req() request: ApiKeyAuthenticatedRequest, @Param('name') name: string) {
    const context = requireApiKeyContext(request);
    const detail = await getMetricCatalogDetail(context.organizationId, context.projectId, name);
    if (!detail) {
      throw new NotFoundException('No metric is registered under this name in this project.');
    }
    return detail;
  }
}
