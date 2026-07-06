import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyApiKeyForRequest, type ApiKeyAuthContext } from '@growthos/firebase-orm-models';

const BEARER_PREFIX = 'Bearer ';

/**
 * The request shape this guard needs — kept dependency-free rather than
 * importing `@types/express`, same reasoning as `policy-request.ts`'s
 * `AuthenticatedRequest`.
 */
export interface IngestRequest {
  headers: { authorization?: string };
  params: { organizationId?: string; projectId?: string; environmentId?: string };
  ingestAuth?: ApiKeyAuthContext;
}

/**
 * Authenticates the ingest API's bearer key (KAN-32, the first real
 * consumer of KAN-28's `verifyApiKeyForRequest`). This is deliberately not
 * `PermissionGuard`: an API key has no `Principal`/`PolicyBinding` in the
 * role-binding sense (`PRINCIPAL_TYPES` is `'user' | 'service_account'`,
 * with no `'api_key'` member) — it carries a scope list, checked directly
 * against the org/project/environment named in the URL. Every ingest route
 * is marked `@Public()` (so `PermissionGuard`'s deny-by-default check and
 * the `growthos/require-permission-annotation` lint rule both pass) and
 * gated instead by this guard via `@UseGuards(IngestApiKeyGuard)`.
 */
@Injectable()
export class IngestApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IngestRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Missing or malformed Authorization header. Expected "Bearer <api key>".');
    }
    const rawKey = header.slice(BEARER_PREFIX.length).trim();

    const { organizationId, projectId, environmentId } = request.params;
    if (!organizationId || !projectId || !environmentId) {
      throw new ForbiddenException('Missing organization, project, or environment in the request path.');
    }

    const result = await verifyApiKeyForRequest({
      rawKey,
      organizationId,
      projectId,
      environmentId,
      requiredScope: 'ingest.write',
    });
    if (!result.ok) {
      throw new ForbiddenException(result.error);
    }

    request.ingestAuth = result.value;
    return true;
  }
}
