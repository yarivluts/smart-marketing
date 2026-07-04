import { startTracing } from './observability/tracing';

startTracing();

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { pinoHttp } from 'pino-http';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './observability/all-exceptions.filter';
import { logger } from './observability/logger';
import { initSentry } from './observability/sentry';

async function bootstrap(): Promise<void> {
  initSentry();

  const app = await NestFactory.create(AppModule);
  app.use(pinoHttp({ logger }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('v1');

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}

void bootstrap();
