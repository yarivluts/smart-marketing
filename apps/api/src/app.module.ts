import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { PermissionGuard } from './authz/permission.guard';
import { IngestModule } from './ingest/ingest.module';
import { MetricsModule } from './metrics/metrics.module';
import { HooksModule } from './hooks/hooks.module';

@Module({
  imports: [IngestModule, MetricsModule, HooksModule],
  controllers: [HealthController],
  providers: [HealthService, { provide: APP_GUARD, useClass: PermissionGuard }],
})
export class AppModule {}
