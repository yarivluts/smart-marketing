import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // `rawBody: true` preserves the exact request bytes on `request.rawBody` alongside the parsed
  // `request.body` — KAN-53's hook receiver needs the untouched bytes for HMAC signature
  // verification, since a re-serialized JSON body would compute a different (and wrong) digest.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // KAN-75's MCP OAuth 2.1 protocol endpoints live outside the `/v1` prefix: `.well-known/*`
  // discovery paths are fixed by RFC 8615 (not app-namespaced), and `/oauth/*` matches what a
  // generic OAuth client (dynamic client registration, `/authorize` redirects) expects to find
  // at the issuer's root rather than under this API's own versioned namespace.
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: '.well-known/oauth-authorization-server', method: RequestMethod.GET },
      { path: '.well-known/oauth-protected-resource', method: RequestMethod.GET },
      { path: 'oauth/register', method: RequestMethod.POST },
      { path: 'oauth/authorize', method: RequestMethod.GET },
      { path: 'oauth/token', method: RequestMethod.POST },
    ],
  });
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}

void bootstrap();
