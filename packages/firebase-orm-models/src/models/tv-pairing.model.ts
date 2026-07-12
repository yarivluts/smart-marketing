import { BaseModel, Field, Model } from '@arbel/firebase-orm';

/**
 * A TV/kiosk browser paired to a project's war-room (KAN-67, E12.3, plan
 * `10 §2.3`: "Works on any TV/browser via a device-pairing code (no login on
 * the TV itself)"). Top-level collection (`reference_path: 'tv_pairings'`,
 * the same shape `UserModel` uses) rather than nested under `organizations/
 * .../projects/...` like every other project-child model in this package —
 * a pairing session is created by an anonymous TV browser *before* any
 * org/project is known (it only learns which board(s) to show once a signed-
 * in admin claims it with the code the TV is displaying), so there is no
 * parent path to nest it under until {@link TvPairingModel.claimed} flips.
 *
 * One secret, `device_token_hash`, authenticates the TV for this pairing's
 * entire lifecycle — both while it's still polling for a human to claim it
 * (`code_expires_at` is the only clock running) and, once claimed, for
 * fetching board/goal data and the win feed (`session_expires_at` takes
 * over). This mirrors `ApiKeyModel`'s "one hashed secret, looked up by hash,
 * revocation is a field not a delete" shape (`api-key.model.ts`) rather than
 * minting a second "viewer token" at claim time — the device already proved
 * it holds the original secret on every poll, so there is nothing a second
 * secret would add. The short human-facing `code` is a *separate*, much
 * lower-entropy secret (6 characters, see `tv-pairing.service.ts`) that only
 * ever needs to resist guessing for its own short `code_expires_at` window
 * and is single-use (`claimed` flips to `true` the moment it's redeemed) —
 * a materially different threat model from the long-lived device token, the
 * same "short code vs. bearer secret" split KAN-46's invite-by-email flow
 * and this codebase's OAuth-less API-key minting both already draw
 * elsewhere.
 */
@Model({
  reference_path: 'tv_pairings',
  path_id: 'tv_pairing_id',
})
export class TvPairingModel extends BaseModel {
  /** SHA-256 hex digest of the device's own long-lived secret. The raw secret is never persisted — see `tv-pairing.service.ts`'s `hashSecret`. */
  @Field({ is_required: true })
  public device_token_hash!: string;

  /** SHA-256 hex digest of the short human-facing pairing code (uppercase, ambiguous-character-free — see `tv-pairing.service.ts`). */
  @Field({ is_required: true })
  public code_hash!: string;

  /** The pairing code's own redemption deadline — a fresh TV that's never been claimed goes fully dead at this point regardless of `session_expires_at` (which doesn't exist yet). */
  @Field({ is_required: true })
  public code_expires_at!: string;

  /** `true` once an admin has redeemed the code. A plain boolean (not "claimed_at presence") because Firestore equality queries need a concrete field to match on — `claimTvPairing`'s own lookup filters `claimed == false` directly. */
  @Field({ is_required: true })
  public claimed!: boolean;

  @Field({ is_required: true })
  public created_at!: string;

  @Field()
  public organization_id?: string;

  @Field()
  public project_id?: string;

  /** `BoardModel.id`s this TV rotates through, in rotation order. Set once, at claim time — a re-pair (new code, new pairing doc) is how an admin changes a TV's board list, the same "config in Firestore, immutable once claimed" posture `ResourceAttachmentModel`'s own decided-state fields take. */
  @Field()
  public board_ids?: string[];

  /** Seconds each board (or the goals frame) stays on screen before rotating to the next — admin-configurable at claim time. */
  @Field()
  public rotation_seconds?: number;

  /** Disables confetti's own falling-particle animation when `true` (plan `10 §4`: "reduced-motion mode (confetti off)") — the celebration sound and win-feed toast still fire; only the vestibular-triggering motion is suppressed, per WCAG's own scope for this setting. */
  @Field()
  public reduced_motion?: boolean;

  /** Admin-assigned display name for this TV (e.g. "Office lobby") — shown in the pairing admin list so more than one paired TV stays distinguishable. */
  @Field()
  public label?: string;

  @Field()
  public claimed_at?: string;

  @Field()
  public claimed_by?: string;

  /** The claimed viewer session's own deadline — refreshed forward on every successful status/rotation poll (see `touchTvPairingSession` in `tv-pairing.service.ts`) so a TV left running indefinitely never has to be re-paired by hand, while an admin revoking (or simply unplugging and never reconnecting) a TV still lets its session lapse. */
  @Field()
  public session_expires_at?: string;

  /** Last time this pairing's device token was presented to any endpoint (status poll, rotation manifest, board fetch, win feed) — the admin list's "last seen" column. */
  @Field()
  public last_seen_at?: string;

  /** Presence alone revokes the pairing immediately, regardless of `session_expires_at` — the same "revocation is a field, not a delete, and is immediate" posture `ApiKeyModel.revoked_at` documents. */
  @Field()
  public revoked_at?: string;

  @Field()
  public revoked_by?: string;
}
