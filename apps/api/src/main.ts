import 'reflect-metadata';
import { initSentry, initTelemetry, shutdownTelemetry } from './instrumentation';

// Must run before any other import triggers HTTP/module instrumentation.
const telemetrySdk = initTelemetry('@growthos/api');
initSentry({ environment: process.env.GROWTHOS_ENV });

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppLoggerService } from './common/logger.service';
import { createLogger, isEnvironment } from '@growthos/shared';

async function bootstrap(): Promise<void> {
  const configuredEnv = process.env.GROWTHOS_ENV;
  const environment = configuredEnv && isEnvironment(configuredEnv) ? configuredEnv : 'dev';
  const logger = createLogger({ service: '@growthos/api', environment });
  const nestLogger = new AppLoggerService('@growthos/api', environment, logger);

  const app = await NestFactory.create(AppModule, { logger: nestLogger });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await shutdownTelemetry(telemetrySdk);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap();
