import { Controller, Get } from '@nestjs/common';
import { Public } from '../authz/public.decorator';
import { apiBaseUrl } from '../mcp-oauth/mcp-oauth-urls';
import { buildIngestContract } from './ingest-contract';

/**
 * `GET /v1/ingest/contract` (KAN-202 I1): the ingest contract as OpenAPI 3.1, without a key - an
 * integrator needs it before they have one. It describes only the public envelope and rules; no
 * project data is read. Kept out of `IngestController`, whose class-level API-key guard would
 * otherwise require a key for it.
 */
@Controller('ingest')
@Public()
export class IngestContractController {
  @Get('contract')
  getContract() {
    return buildIngestContract(apiBaseUrl());
  }
}
