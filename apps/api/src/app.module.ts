import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { DBT_BUILD_INFO_EXECUTOR, DbtRefreshBuildService } from './health/dbt-refresh-build.service';
import { defaultWarehouseQueryExecutor } from '@growthos/firebase-orm-models';
import { PermissionGuard } from './authz/permission.guard';
import { IngestModule } from './ingest/ingest.module';
import { MetricsModule } from './metrics/metrics.module';
import { HooksModule } from './hooks/hooks.module';
import { McpModule } from './mcp/mcp.module';
import { McpOAuthModule } from './mcp-oauth/mcp-oauth.module';
import { TraceMiddleware } from './observability/trace.middleware';

@Module({
  imports: [SentryModule.forRoot(), IngestModule, MetricsModule, HooksModule, McpModule, McpOAuthModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    DbtRefreshBuildService,
    { provide: DBT_BUILD_INFO_EXECUTOR, useValue: defaultWarehouseQueryExecutor },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
