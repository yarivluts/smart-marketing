import type { AddressInfo } from 'node:net';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { PolicyBinding } from '@growthos/shared';
import { PermissionGuard } from './permission.guard';
import { Public } from './public.decorator';
import { RequirePermission } from './permission.decorator';
import type { AuthenticatedRequest, RequestPrincipal } from './policy-request';

@Controller('demo')
class DemoController {
  @Get('public')
  @Public()
  getPublic(): { ok: true } {
    return { ok: true };
  }

  @Get('unannotated')
  getUnannotated(): { ok: true } {
    return { ok: true };
  }

  @Get('protected')
  @RequirePermission('schema.write')
  getProtected(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  controllers: [DemoController],
  providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
})
class DemoModule {}

/**
 * Stands in for the auth middleware KAN-21 will add: reads a test-only
 * `x-test-auth` header and attaches `principal`/`bindings` to the request,
 * exactly what `PermissionGuard` expects to find once real auth exists.
 */
function testAuthMiddleware(
  req: AuthenticatedRequest & { headers: Record<string, string | undefined> },
  _res: unknown,
  next: () => void,
): void {
  const header = req.headers['x-test-auth'];
  if (typeof header === 'string') {
    const parsed = JSON.parse(header) as { principal: RequestPrincipal; bindings: PolicyBinding[] };
    req.principal = parsed.principal;
    req.bindings = parsed.bindings;
  }
  next();
}

describe('PermissionGuard (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [DemoModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(testAuthMiddleware);
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows a @Public() route with no principal', async () => {
    const res = await fetch(`${baseUrl}/demo/public`);
    expect(res.status).toBe(200);
  });

  it('denies (403, fail-closed) a route with no permission annotation at all', async () => {
    const res = await fetch(`${baseUrl}/demo/unannotated`);
    expect(res.status).toBe(403);
  });

  it('rejects (401) an annotated route when the request has no principal', async () => {
    const res = await fetch(`${baseUrl}/demo/protected`);
    expect(res.status).toBe(401);
  });

  it('denies (403) an annotated route when bindings do not grant the permission', async () => {
    const auth = {
      principal: { type: 'user', id: 'u1' },
      bindings: [] as PolicyBinding[],
    };
    const res = await fetch(`${baseUrl}/demo/protected`, {
      headers: { 'x-test-auth': JSON.stringify(auth) },
    });
    expect(res.status).toBe(403);
  });

  it('allows an annotated route when a role binding grants the permission', async () => {
    const auth = {
      principal: { type: 'user', id: 'u1' },
      bindings: [
        {
          principalType: 'user',
          principalId: 'u1',
          role: 'project_admin',
          scopeLevel: 'platform',
          scopeId: 'n/a',
        },
      ] as PolicyBinding[],
    };
    const res = await fetch(`${baseUrl}/demo/protected`, {
      headers: { 'x-test-auth': JSON.stringify(auth) },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
