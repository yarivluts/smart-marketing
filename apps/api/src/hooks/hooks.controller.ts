import { Controller, HttpCode, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { HookEndpointNotFoundError, receiveHookPayload } from '@growthos/firebase-orm-models';
import { Public } from '../authz/public.decorator';
import { getServerKmsProvider } from './kms-provider';

const SIGNATURE_HEADER = 'x-growthos-signature';

interface HookRequest {
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

function normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (Array.isArray(value)) {
      normalized[key] = value.join(', ');
    }
  }
  return normalized;
}

interface HookReceiveResponse {
  status: 'received';
}

/**
 * `POST /v1/hooks/{project}/{hook_id}` (KAN-53, plan `12 §2.4`/`08 §3.2`) — the zero-code path
 * for any external SaaS webhook. No bearer key: the caller is a third party with no GrowthOS
 * credential, so identity comes entirely from `{hook_id}` (a `HookEndpointModel` id, looked up
 * across all orgs the same bearer-key-free way `authenticateApiKey` resolves KAN-32's flat
 * ingest routes) and, optionally, an `X-GrowthOS-Signature` HMAC. `@Public()` opts this out of
 * `PermissionGuard`'s deny-by-default the same way `IngestController` does for its own
 * bearer-key (not role-binding) auth.
 */
@Controller('hooks')
@Public()
export class HooksController {
  @Post(':project/:hookId')
  @HttpCode(202)
  async receive(
    @Param('project') projectId: string,
    @Param('hookId') hookId: string,
    @Req() request: HookRequest,
  ): Promise<HookReceiveResponse> {
    const rawBody = request.rawBody ? request.rawBody.toString('utf8') : '';
    const signatureHeaderValue = request.headers[SIGNATURE_HEADER];
    const signatureHeader = typeof signatureHeaderValue === 'string' ? signatureHeaderValue : undefined;

    try {
      await receiveHookPayload({
        projectId,
        hookEndpointId: hookId,
        rawBody,
        headers: normalizeHeaders(request.headers),
        signatureHeaderValue: signatureHeader,
        getKms: () => getServerKmsProvider(),
      });
    } catch (error) {
      if (error instanceof HookEndpointNotFoundError) {
        throw new NotFoundException('Hook endpoint not found.');
      }
      throw error;
    }

    return { status: 'received' };
  }
}
