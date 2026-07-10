import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true populates `request.rawBody` alongside the usual parsed `request.body` — needed
  // by HooksController's HMAC signature verification, which must hash the exact bytes a webhook
  // sender signed, not a re-serialization of the parsed JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('v1');
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}

void bootstrap();
