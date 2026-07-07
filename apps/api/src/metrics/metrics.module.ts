import { Module } from '@nestjs/common';
import { defaultApiKeyRateLimiter } from '@growthos/firebase-orm-models';
import { MetricsController } from './metrics.controller';
import { API_KEY_RATE_LIMITER } from '../authz/api-key-auth.guard';

@Module({
  controllers: [MetricsController],
  providers: [{ provide: API_KEY_RATE_LIMITER, useValue: defaultApiKeyRateLimiter }],
})
export class MetricsModule {}
