import { createHash } from 'node:crypto';
import { normalizePushPreferences, PUSH_CATEGORIES, type PushCategory, type PushPreferences } from '@growthos/shared';
import { MembershipModel } from '../models/membership.model';
import { GrowthTargetModel } from '../models/growth-pilot.model';
import { PushPreferencesModel, PushSubscriptionModel } from '../models/push-notification.model';

/**
 * Browser push: the devices a person subscribed, their notification choices, and who in a project
 * should hear about an update. Sending itself lives in the web app (it holds the VAPID keys).
 */

export class PushSubscriptionInvalidError extends Error {
  constructor(public readonly reason: string) {
    super(`The push subscription is not valid: ${reason}`);
    this.name = 'PushSubscriptionInvalidError';
  }
}

export class PushSubscriptionNotFoundError extends Error {
  constructor() {
    super('Push subscription not found.');
    this.name = 'PushSubscriptionNotFoundError';
  }
}

/** The document id of a subscription: a hash, so the endpoint itself never becomes a path. */
export function pushSubscriptionId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 40);
}

const MAX_ENDPOINT = 2_000;
const MAX_KEY = 200;
const MAX_LABEL = 120;
const MAX_USER_AGENT = 500;

/**
 * The browsers' push services (Chrome/Edge-on-Android/Samsung/Opera: FCM; Firefox: Mozilla;
 * Safari: Apple; Edge on Windows: WNS). Only these are accepted, so a saved "subscription" can
 * never make the server post to an arbitrary address.
 */
const PUSH_SERVICE_HOST_SUFFIXES = ['.googleapis.com', '.mozilla.com', '.mozaws.net', '.push.apple.com', '.notify.windows.com'];

export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = `.${url.hostname.toLowerCase()}`;
    return url.protocol === 'https:' && !url.port && PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

/** Saves (or refreshes) a browser's subscription for a user; the same endpoint keeps one row. */
export async function savePushSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel?: string | null;
  userAgent?: string | null;
  locale?: string | null;
  now?: Date;
}): Promise<PushSubscriptionModel> {
  const endpoint = params.endpoint.trim();
  if (!endpoint || endpoint.length > MAX_ENDPOINT || !isPushEndpoint(endpoint)) throw new PushSubscriptionInvalidError('endpoint');
  const p256dh = params.p256dh.trim();
  const auth = params.auth.trim();
  if (!p256dh || p256dh.length > MAX_KEY || !auth || auth.length > MAX_KEY) throw new PushSubscriptionInvalidError('keys');
  const now = (params.now ?? new Date()).toISOString();
  const id = pushSubscriptionId(endpoint);
  const existing = await PushSubscriptionModel.init(id);
  const row = existing ?? new PushSubscriptionModel();
  // A different person signing in on this browser takes the subscription over: it is their device now.
  const sameOwner = existing?.user_id === params.userId;
  row.user_id = params.userId;
  row.endpoint = endpoint;
  row.p256dh = p256dh;
  row.auth = auth;
  row.device_label = params.deviceLabel?.trim().slice(0, MAX_LABEL) || null;
  row.user_agent = params.userAgent?.slice(0, MAX_USER_AGENT) || null;
  row.locale = params.locale?.trim().slice(0, 10) || null;
  row.created_at = existing && sameOwner ? existing.created_at : now;
  row.last_used_at = now;
  await row.save(id);
  return row;
}

/** Every device a user subscribed, newest first. */
export async function listPushSubscriptionsForUser(userId: string): Promise<PushSubscriptionModel[]> {
  const rows = await PushSubscriptionModel.query().where('user_id', '==', userId).get();
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Removes one of the user's own devices by id; someone else's id is reported as not found. */
export async function removePushSubscription(userId: string, subscriptionId: string): Promise<void> {
  const row = await PushSubscriptionModel.init(subscriptionId);
  if (!row || row.user_id !== userId) throw new PushSubscriptionNotFoundError();
  await row.remove();
}

/** Removes the user's subscription for an endpoint (the browser unsubscribed); false when there was none. */
export async function removePushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<boolean> {
  const row = await PushSubscriptionModel.init(pushSubscriptionId(endpoint.trim()));
  if (!row || row.user_id !== userId) return false;
  await row.remove();
  return true;
}

/** Drops a subscription the push service said is gone (404/410). */
export async function deleteExpiredPushSubscription(subscriptionId: string): Promise<void> {
  const row = await PushSubscriptionModel.init(subscriptionId);
  if (row) await row.remove();
}

/** Stamps a successful delivery. */
export async function touchPushSubscription(subscriptionId: string, now: Date = new Date()): Promise<void> {
  const row = await PushSubscriptionModel.init(subscriptionId);
  if (!row) return;
  row.last_used_at = now.toISOString();
  await row.save();
}

/** A person's choices; everything on when they never changed anything. */
export async function getPushPreferences(userId: string): Promise<PushPreferences> {
  const row = await PushPreferencesModel.init(userId);
  return normalizePushPreferences(row ? { enabled: row.enabled, categories: row.categories } : null);
}

/** Changes the master switch and/or some categories; the rest keep their value. */
export async function setPushPreferences(params: {
  userId: string;
  enabled?: boolean;
  categories?: Partial<Record<PushCategory, boolean>>;
  now?: Date;
}): Promise<PushPreferences> {
  const current = await getPushPreferences(params.userId);
  const next: PushPreferences = {
    enabled: typeof params.enabled === 'boolean' ? params.enabled : current.enabled,
    categories: { ...current.categories },
  };
  for (const category of PUSH_CATEGORIES) {
    const value = params.categories?.[category];
    if (typeof value === 'boolean') next.categories[category] = value;
  }
  const row = (await PushPreferencesModel.init(params.userId)) ?? new PushPreferencesModel();
  row.user_id = params.userId;
  row.enabled = next.enabled;
  row.categories = next.categories;
  row.updated_at = (params.now ?? new Date()).toISOString();
  await row.save(params.userId);
  return next;
}

/**
 * Who hears about an update in a project: active members whose role covers the whole organization,
 * plus active members whose role is scoped to this project. Invited and suspended members do not.
 */
export async function listProjectNotificationRecipients(organizationId: string, projectId: string): Promise<string[]> {
  const memberships = await MembershipModel.initPath({ organization_id: organizationId }).where('organization_id', '==', organizationId).get();
  const ids = memberships
    .filter((membership) => (membership.status ?? 'active') === 'active')
    .filter((membership) => !membership.project_id || membership.project_id === projectId)
    .map((membership) => membership.user_id);
  return [...new Set(ids)];
}

/** Whether an Ad Studio brief was made by a Growth Pilot target (the pilot then sends its own update). */
export async function isGrowthPilotBrief(organizationId: string, projectId: string, briefId: string): Promise<boolean> {
  const rows = await GrowthTargetModel.initPath({ organization_id: organizationId, project_id: projectId }).where('brief_id', '==', briefId).get();
  return rows.length > 0;
}
