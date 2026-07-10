import { Controller, HttpCode, NotFoundException, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { receiveHookPayload, VaultNotConfiguredError } from '@growthos/firebase-orm-models';
import { Public } from '../authz/public.decorator';
import { getServerKmsProvider } from '../vault/kms-provider';

interface ReceiveHookResponse {
  delivery_id: string;
  status: string;
  signature_verified: boolean;
}

/**
 * The request shape this controller needs — a minimal subset of Express's
 * `Request` (plus Nest's `rawBody: true` addition), kept dependency-free
 * like `ApiKeyAuthenticatedRequest` (`api-key-auth.guard.ts`) rather than
 * importing `@types/express` for one field.
 */
interface RawBodyHookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
}

/** Flattens Node's `IncomingHttpHeaders` (values can repeat as arrays) down to the single-value map `receiveHookPayload`/HMAC verification expects — the first value wins, matching how most HTTP libraries treat a repeated signature header. */
function flattenHeaders(headers: RawBodyHookRequest['headers']): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      flat[name] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      flat[name] = value[0];
    }
  }
  return flat;
}

/**
 * `POST /v1/hooks/:hookId` — the zero-config inbound webhook receiver
 * (KAN-53, E9.1: plan `12 §2.4` "point any SaaS webhook here"). Flat,
 * token-resolved URL rather than the plan sketch's nested `/v1/hooks/{project}/{hook_id}`
 * — the same deliberate deviation KAN-32's `/v1/ingest/*` already established
 * for the same reason: the token itself (not the URL path) is the source of
 * truth for which org/project/environment a request belongs to.
 *
 * Deliberately **not** gated by `ApiKeyAuthGuard` — a third-party webhook
 * sender has no GrowthOS API key, only the unguessable `hookId` in the URL
 * (and, for `hmac_sha256`-mode endpoints, a signed body). Reads the raw,
 * unparsed request body (`request.rawBody`, enabled globally in `main.ts`)
 * since signature verification is byte-sensitive.
 *
 * `request.rawBody` is only populated for requests Nest's global JSON body
 * parser actually parses (`Content-Type: application/json`) — the buildable-
 * today scope covers the JSON-payload senders every mainstream webhook
 * provider (Stripe, GitHub, Shopify, ...) uses; a sender posting a
 * non-JSON content type gets an empty raw body rather than a crash.
 */
@Controller('hooks')
@Public()
export class HooksController {
  @Post(':hookId')
  @HttpCode(202)
  async receive(@Req() request: RawBodyHookRequest, @Param('hookId') hookId: string): Promise<ReceiveHookResponse> {
    const rawBody = request.rawBody?.toString('utf8') ?? '';

    let kms;
    try {
      kms = getServerKmsProvider();
    } catch (err) {
      if (!(err instanceof VaultNotConfiguredError)) {
        throw err;
      }
      // No vault configured on this deploy: `signature_mode: 'none'` endpoints still work fine
      // (receiveHookPayload never touches `kms` for them); an `hmac_sha256` endpoint just can't
      // verify anything and fails closed via the `invalid_signature` branch below.
      kms = undefined;
    }

    const result = await receiveHookPayload({ hookId, rawBody, headers: flattenHeaders(request.headers), kms });
    if (!result.ok) {
      if (result.error === 'not_found') {
        throw new NotFoundException('No such hook endpoint.');
      }
      throw new UnauthorizedException('Signature verification failed.');
    }

    return {
      delivery_id: result.value.delivery.id,
      status: result.value.delivery.status,
      signature_verified: result.value.delivery.signature_verified,
    };
  }
}
