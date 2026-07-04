import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}

void bootstrap();
