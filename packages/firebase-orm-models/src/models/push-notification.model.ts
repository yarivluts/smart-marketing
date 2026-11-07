import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * One browser (on one device) that agreed to receive push notifications for a user. The document
 * id is a hash of the push endpoint, so the same browser subscribing again updates its own row,
 * and a browser that a different person signs in on moves to that person instead of notifying both.
 */
@Model({
  reference_path: 'push_subscriptions',
  path_id: 'push_subscription_id',
})
export class PushSubscriptionModel extends BaseModel {
  /** The platform-wide `UserModel.id`. */
  @Field({ is_required: true })
  public user_id!: string;

  /** The push service URL the browser handed out. Secret-ish: only its owner ever sees it listed. */
  @Field({ is_required: true })
  public endpoint!: string;

  /** The browser's public key (base64url) the payload is encrypted to. */
  @Field({ is_required: true })
  public p256dh!: string;

  /** The browser's auth secret (base64url) for the payload encryption. */
  @Field({ is_required: true })
  public auth!: string;

  /** A short name for the device, read from its user agent (e.g. "Chrome on Android"). */
  @Field({ is_required: false })
  public device_label?: string | null;

  @Field({ is_required: false })
  public user_agent?: string | null;

  /** The site language when the browser subscribed: notifications to it are written in it. */
  @Field({ is_required: false })
  public locale?: string | null;

  @Field({ is_required: true })
  public created_at!: string;

  /** The last time a notification was delivered to it (or it subscribed again). */
  @Field({ is_required: false })
  public last_used_at?: string | null;
}

/**
 * A person's notification choices: a master switch plus one switch per category (see
 * `PUSH_CATEGORIES` in `@growthos/shared`). The document id is the user id; no row means
 * everything is on.
 */
@Model({
  reference_path: 'push_preferences',
  path_id: 'push_preferences_id',
})
export class PushPreferencesModel extends BaseModel {
  @Field({ is_required: true })
  public user_id!: string;

  @Field({ is_required: true })
  public enabled!: boolean;

  @Field({ is_required: true })
  public categories!: Record<string, boolean>;

  @Field({ is_required: true })
  public updated_at!: string;
}
