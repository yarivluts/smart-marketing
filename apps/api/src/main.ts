import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // `rawBody: true` preserves the exact request bytes on `request.rawBody` alongside the parsed
  // `request.body` — KAN-53's hook receiver needs the untouched bytes for HMAC signature
  // verification, since a re-serialized JSON body would compute a different (and wrong) digest.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('v1');
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}

void bootstrap();
