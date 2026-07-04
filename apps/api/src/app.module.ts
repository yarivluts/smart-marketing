import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { TraceMiddleware } from './observability/trace.middleware';

@Module({
  imports: [SentryModule.forRoot()],
  controllers: [HealthController],
  providers: [HealthService, { provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
