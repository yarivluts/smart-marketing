import 'server-only';
import {
  deleteExpiredPushSubscription,
  getPushPreferences,
  listPushSubscriptionsForUser,
  touchPushSubscription,
  type PushSubscriptionModel,
} from '@growthos/firebase-orm-models';
import { pushAllowed, type PushCategory, type PushPayload } from '@growthos/shared';
import { resolveWebPushConfig, type WebPushConfig } from './config';

/**
 * Sends browser pushes with `web-push` (VAPID). Every send is best-effort: a failure is counted,
 * never thrown, and a subscription the push service says is gone (404/410) is deleted so it is not
 * tried again.
 */

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The one call that reaches a push service; tests replace it. */
export type PushTransport = (target: PushTarget, body: string, config: WebPushConfig) => Promise<void>;

export const webPushTransport: PushTransport = async (target, body, config) => {
  const webPush = (await import('web-push')).default;
  await webPush.sendNotification(target, body, {
    vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
    TTL: 24 * 60 * 60,
    urgency: 'normal',
    timeout: 10_000,
  });
};

export interface DeliveryResult {
  status: 'not_configured' | 'sent';
  sent: number;
  failed: number;
  removed: number;
  /** Recipients skipped because their own choices exclude this notification. */
  optedOut: number;
}

function statusCodeOf(error: unknown): number | null {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === 'number' ? code : null;
}

async function sendToSubscriptions(
  subscriptions: PushSubscriptionModel[],
  payloadFor: (locale: string | null) => Promise<PushPayload>,
  config: WebPushConfig,
  transport: PushTransport,
  result: DeliveryResult,
): Promise<void> {
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const payload = await payloadFor(subscription.locale ?? null);
        await transport({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload), config);
        result.sent += 1;
        await touchPushSubscription(subscription.id).catch(() => undefined);
      } catch (error) {
        const status = statusCodeOf(error);
        if (status === 404 || status === 410) {
          result.removed += 1;
          await deleteExpiredPushSubscription(subscription.id).catch(() => undefined);
        } else {
          result.failed += 1;
          console.warn('[push] delivery failed', { status, subscription: subscription.id });
        }
      }
    }),
  );
}

export interface DeliverOptions {
  transport?: PushTransport;
  config?: WebPushConfig | null;
}

/**
 * Sends one category of notification to each user whose choices allow it, on every device they
 * subscribed. `payloadFor` words it per device language.
 */
export async function deliverToUsers(
  params: { userIds: string[]; category: PushCategory; payloadFor: (locale: string | null) => Promise<PushPayload> },
  options: DeliverOptions = {},
): Promise<DeliveryResult> {
  const config = options.config === undefined ? resolveWebPushConfig() : options.config;
  const result: DeliveryResult = { status: config ? 'sent' : 'not_configured', sent: 0, failed: 0, removed: 0, optedOut: 0 };
  if (!config) return result;
  const transport = options.transport ?? webPushTransport;
  await Promise.all(
    [...new Set(params.userIds)].map(async (userId) => {
      try {
        if (!pushAllowed(await getPushPreferences(userId), params.category)) {
          result.optedOut += 1;
          return;
        }
        await sendToSubscriptions(await listPushSubscriptionsForUser(userId), params.payloadFor, config, transport, result);
      } catch (error) {
        result.failed += 1;
        console.warn('[push] could not notify a user', { error: error instanceof Error ? error.message : String(error) });
      }
    }),
  );
  return result;
}

/** The settings page's test: every device of this user, whatever their category choices. */
export async function deliverTestToUser(
  params: { userId: string; payloadFor: (locale: string | null) => Promise<PushPayload> },
  options: DeliverOptions = {},
): Promise<DeliveryResult> {
  const config = options.config === undefined ? resolveWebPushConfig() : options.config;
  const result: DeliveryResult = { status: config ? 'sent' : 'not_configured', sent: 0, failed: 0, removed: 0, optedOut: 0 };
  if (!config) return result;
  await sendToSubscriptions(await listPushSubscriptionsForUser(params.userId), params.payloadFor, config, options.transport ?? webPushTransport, result);
  return result;
}
