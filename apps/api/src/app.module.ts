import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { PermissionGuard } from './authz/permission.guard';
import { IngestModule } from './ingest/ingest.module';
import { MetricsModule } from './metrics/metrics.module';
import { HooksModule } from './hooks/hooks.module';
import { McpModule } from './mcp/mcp.module';
import { McpOAuthModule } from './mcp-oauth/mcp-oauth.module';

@Module({
  imports: [IngestModule, MetricsModule, HooksModule, McpModule, McpOAuthModule],
  controllers: [HealthController],
  providers: [HealthService, { provide: APP_GUARD, useClass: PermissionGuard }],
})
export class AppModule {}
