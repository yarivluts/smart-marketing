import { Module } from '@nestjs/common';
import { defaultApiKeyRateLimiter } from '@growthos/firebase-orm-models';
import { IngestContractController } from './ingest-contract.controller';
import { IngestController } from './ingest.controller';
import { API_KEY_RATE_LIMITER } from '../authz/api-key-auth.guard';

@Module({
  controllers: [IngestContractController, IngestController],
  providers: [{ provide: API_KEY_RATE_LIMITER, useValue: defaultApiKeyRateLimiter }],
})
export class IngestModule {}
