import { createHash, randomBytes } from 'node:crypto';
import { err, ok, type Result } from '@growthos/shared';
import { TvPairingModel } from '../models/tv-pairing.model';
import { ProjectModel } from '../models/project.model';
import { BoardModel } from '../models/board.model';
import { ProjectNotFoundError } from './resource-library.service';
import { recordAuditLogEntry } from './audit-log.service';

export class InvalidTvPairingError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Invalid TV pairing request: ${reasons.join('; ')}`);
    this.name = 'InvalidTvPairingError';
  }
}

export class TvPairingNotFoundError extends Error {
  constructor() {
    super('No TV pairing with this id exists in this project.');
    this.name = 'TvPairingNotFoundError';
  }
}

/** How long a freshly requested pairing code stays redeemable before the TV must request a new one — long enough for a human to walk over and type it, short enough that a code left on screen isn't a standing liability. */
const CODE_TTL_MS = 10 * 60 * 1000;

/** How long a claimed viewer session lasts before it must be refreshed by a poll — see `touchTvPairingSession`. Comfortably past the AC's "runs 24h" bar so a TV that's merely slow to poll (a rotation frame mid-render, a transient network blip) never gets logged out mid-shift. */
const SESSION_TTL_MS = 48 * 60 * 60 * 1000;

/** Ambiguous characters (0/O, 1/I/L) excluded so a human reading the code off a TV screen from across a room can type it back correctly. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const ROTATION_SECONDS_MIN = 5;
const ROTATION_SECONDS_MAX = 600;

function hashSecret(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function generateDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

// The largest multiple of CODE_ALPHABET.length that fits in a byte (0-255) —
// rejecting bytes at or above this cutoff avoids the modulo-bias a plain
// `byte % CODE_ALPHABET.length` would introduce (256 isn't a multiple of 31,
// so a naive modulo would make the first `256 % 31 = 8` alphabet characters
// ~12.5% more likely than the rest, weakening the code's real entropy against
// guessing within its `CODE_TTL_MS` window).
const CODE_BYTE_CUTOFF = 256 - (256 % CODE_ALPHABET.length);

function generatePairingCode(): string {
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of randomBytes(CODE_LENGTH - code.length)) {
      if (byte < CODE_BYTE_CUTOFF) {
        code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      }
    }
  }
  return code;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

async function requireProjectInOrg(organizationId: string, projectId: string): Promise<ProjectModel> {
  const project = await ProjectModel.init(projectId, { organization_id: organizationId });
  if (!project || project.organization_id !== organizationId) {
    throw new ProjectNotFoundError();
  }
  return project;
}

/** The pairing's own doc, scoped and existence-checked — the same `.init` + field-match pattern `loadBoard` (`board.service.ts`) uses, except scoped to `organization_id`/`project_id` rather than a Firestore parent path since this model is top-level (see `TvPairingModel`'s own doc comment). */
async function loadTvPairingInProject(organizationId: string, projectId: string, pairingId: string): Promise<TvPairingModel> {
  const pairing = await TvPairingModel.init(pairingId);
  if (!pairing || pairing.organization_id !== organizationId || pairing.project_id !== projectId) {
    throw new TvPairingNotFoundError();
  }
  return pairing;
}

function isRevoked(pairing: TvPairingModel): boolean {
  return pairing.revoked_at !== undefined;
}

/** Whether a *claimed* pairing's viewer session is still live — the one revoked/session-expiry check `getTvPairingStatus` and `requireClaimedTvPairing` both need, factored out so a future change to either rule (e.g. a grace period) can't be applied to one call site and missed on the other. Callers are responsible for handling the "not yet claimed" case themselves (see `getTvPairingStatus`'s own `pending`/`expired` branch), since an unclaimed pairing has no session to be live or not. */
function isClaimedSessionLive(pairing: TvPairingModel, nowIso: string): boolean {
  return !isRevoked(pairing) && pairing.session_expires_at !== undefined && pairing.session_expires_at >= nowIso;
}

export interface RequestTvPairingResult {
  pairingId: string;
  /** The full raw device secret — only ever available here, at mint time (see `ApiKeyModel`'s own "copy-once" doc comment for the same reasoning). The TV must persist this itself (e.g. `localStorage`) to authenticate every subsequent call for the rest of this pairing's life. */
  deviceToken: string;
  /** The short human-facing code to display on screen — never persisted in the clear, only its hash. */
  code: string;
  codeExpiresAt: string;
}

/** A brand-new, unclaimed pairing session — the TV's very first call, before any org/project is known (KAN-67 AC: "device pairing code, no login on the TV itself"). */
export async function requestTvPairing(): Promise<RequestTvPairingResult> {
  const deviceToken = generateDeviceToken();
  const code = generatePairingCode();
  const now = new Date();
  const codeExpiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();

  const pairing = new TvPairingModel();
  pairing.device_token_hash = hashSecret(deviceToken);
  pairing.code_hash = hashSecret(code);
  pairing.code_expires_at = codeExpiresAt;
  pairing.claimed = false;
  pairing.created_at = now.toISOString();
  await pairing.save();

  return { pairingId: pairing.id, deviceToken, code, codeExpiresAt };
}

/** Looks a pairing up purely by its device-token hash — the same "hash lookup shared by every entry point" shape `findLiveApiKeyByRawKey` (`key.service.ts`) uses. Does not itself check expiry/revocation — callers branch on those explicitly since "expired" and "revoked" are distinct, user-visible statuses (see `getTvPairingStatus`), not one flat rejection. */
async function findTvPairingByDeviceToken(deviceToken: string): Promise<Result<TvPairingModel, string>> {
  const hashedToken = hashSecret(deviceToken);
  const matches = await TvPairingModel.query().where('device_token_hash', '==', hashedToken).limit(1).get();
  const pairing = matches[0];
  if (!pairing) {
    return err('Invalid pairing token.');
  }
  return ok(pairing);
}

export type TvPairingStatus =
  | { status: 'pending'; codeExpiresAt: string }
  | { status: 'expired' }
  | { status: 'revoked' }
  | {
      status: 'claimed';
      organizationId: string;
      projectId: string;
      boardIds: string[];
      rotationSeconds: number;
      reducedMotion: boolean;
      label: string;
    }
  | { status: 'invalid' };

/** Floor on how often `touchTvPairing` actually writes for one pairing. A TV can legally rotate boards as fast as `ROTATION_SECONDS_MIN` (5s), and every board/rotation/win-feed request calls this — without a floor, a fast-rotating TV would drive a Firestore write on nearly every request (tens of thousands over a 24h shift) just to bump fields that only need coarse, minute-scale freshness: `last_seen_at` is a human-facing "how recently was this TV seen" label, and `SESSION_TTL_MS` (48h) has enormous slack against a 60s staleness window. */
const TOUCH_THROTTLE_MS = 60 * 1000;

/** Marks a live pairing as "seen" — pushes `session_expires_at` forward another `SESSION_TTL_MS` (a claimed pairing only) and refreshes `last_seen_at`, so the admin pairing list's "last seen" column reflects recent activity, not just the original claim. Throttled (see `TOUCH_THROTTLE_MS`) rather than firing on every call. Best-effort: a write failure here must never fail the caller's own read. */
async function touchTvPairing(pairing: TvPairingModel): Promise<void> {
  const now = new Date();
  if (pairing.last_seen_at && now.getTime() - new Date(pairing.last_seen_at).getTime() < TOUCH_THROTTLE_MS) {
    return;
  }
  pairing.last_seen_at = now.toISOString();
  if (pairing.claimed) {
    pairing.session_expires_at = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  }
  try {
    await pairing.save();
  } catch {
    // Best-effort — see this function's own doc comment.
  }
}

/** Resolves a device token to its current, user-facing status — the TV's poll loop (pre-claim) and its rotation/board/win-feed fetches (post-claim) all start here. */
export async function getTvPairingStatus(deviceToken: string): Promise<TvPairingStatus> {
  const found = await findTvPairingByDeviceToken(deviceToken);
  if (!found.ok) {
    return { status: 'invalid' };
  }
  const pairing = found.value;

  if (isRevoked(pairing)) {
    return { status: 'revoked' };
  }

  const now = new Date().toISOString();
  if (!pairing.claimed) {
    if (pairing.code_expires_at < now) {
      return { status: 'expired' };
    }
    await touchTvPairing(pairing);
    return { status: 'pending', codeExpiresAt: pairing.code_expires_at };
  }

  const { organization_id: organizationId, project_id: projectId } = pairing;
  if (!isClaimedSessionLive(pairing, now) || !organizationId || !projectId) {
    return { status: 'expired' };
  }

  await touchTvPairing(pairing);
  return {
    status: 'claimed',
    organizationId,
    projectId,
    boardIds: pairing.board_ids ?? [],
    rotationSeconds: pairing.rotation_seconds ?? 30,
    reducedMotion: pairing.reduced_motion ?? false,
    label: pairing.label ?? '',
  };
}

/**
 * Resolves a device token to a *live, claimed* pairing scoped to one
 * org/project — the shared guard every session-less viewer endpoint (board
 * data, win feed) calls before touching anything else, so "wrong token" and
 * "token not claimed yet" and "token claimed for a different project" all
 * collapse to the same 401 the route layer returns (see `route.ts` files
 * under `apps/web/app/api/tv-pairing/`) rather than leaking which case it
 * was.
 */
export async function requireClaimedTvPairing(deviceToken: string): Promise<Result<TvPairingModel, string>> {
  const found = await findTvPairingByDeviceToken(deviceToken);
  if (!found.ok) {
    return found;
  }
  const pairing = found.value;
  if (isRevoked(pairing) || !pairing.claimed) {
    return err('This TV is not currently paired.');
  }
  if (!isClaimedSessionLive(pairing, new Date().toISOString())) {
    return err('This TV pairing session has expired.');
  }
  await touchTvPairing(pairing);
  return ok(pairing);
}

export interface ClaimTvPairingParams {
  organizationId: string;
  projectId: string;
  code: string;
  boardIds: string[];
  rotationSeconds: number;
  reducedMotion: boolean;
  label: string;
  claimedByUserId: string;
}

function validateClaimFields(params: ClaimTvPairingParams, reasons: string[]): void {
  if (params.boardIds.length === 0) {
    reasons.push('A paired TV must rotate through at least one board.');
  }
  if (!Number.isInteger(params.rotationSeconds) || params.rotationSeconds < ROTATION_SECONDS_MIN || params.rotationSeconds > ROTATION_SECONDS_MAX) {
    reasons.push(`Rotation interval must be an integer between ${ROTATION_SECONDS_MIN} and ${ROTATION_SECONDS_MAX} seconds.`);
  }
  if (params.label.trim().length === 0) {
    reasons.push('A paired TV must have a non-empty label.');
  }
}

/**
 * Redeems a pairing code (KAN-67 AC: "device pairing code"), scoping the
 * previously anonymous pairing doc to this org/project and recording which
 * boards it rotates through. Looked up by `code_hash` + `claimed == false`
 * (not by `organization_id`, which doesn't exist on the doc yet) — the code
 * itself is the only thing that ties an unclaimed pairing to the admin
 * redeeming it, so a wrong/expired/already-claimed code all collapse to one
 * `InvalidTvPairingError` rather than distinguishing "no such code" from
 * "someone else already claimed it", which would let a caller brute-force
 * discover which codes are currently live.
 *
 * Not transactional: the read-then-write on `claimed` below (look up an
 * unclaimed pairing by code, then save it as claimed) has the same narrow
 * concurrent-write race every other multi-step Firestore read/write in this
 * package documents and accepts — this ORM's client-SDK-based API exposes no
 * transaction primitive (raw Firestore SDK access is reserved to
 * `firestore-connection.ts`; see `registerSchemaDefinition`'s own doc
 * comment for the fullest statement of this codebase-wide tradeoff). Two
 * admins claiming the exact same still-valid code within the same instant
 * would race on which write wins — low real-world likelihood (a code is
 * single-use, 10-minute-lived, and only ever known to whoever is physically
 * reading it off one TV screen), and a losing caller simply doesn't see
 * their TV appear in `listTvPairingsForProject` afterward and can re-pair.
 */
export async function claimTvPairing(params: ClaimTvPairingParams): Promise<TvPairingModel> {
  await requireProjectInOrg(params.organizationId, params.projectId);

  const reasons: string[] = [];
  validateClaimFields(params, reasons);

  // Per-id lookups (mirroring `getBoard`'s own `.init` + org/project-match
  // pattern in `board.service.ts`) rather than a full collection scan of
  // every board in the project — this only reads the handful of boards
  // actually being claimed, not every board the project has ever had.
  const uniqueBoardIds = [...new Set(params.boardIds)];
  const boardLookups = await Promise.all(
    uniqueBoardIds.map(async (boardId) => {
      const board = await BoardModel.init(boardId, { organization_id: params.organizationId, project_id: params.projectId });
      return { boardId, exists: board !== null && board.project_id === params.projectId };
    }),
  );
  for (const { boardId, exists } of boardLookups) {
    if (!exists) {
      reasons.push(`Board "${boardId}" does not exist in this project.`);
    }
  }

  if (reasons.length > 0) {
    throw new InvalidTvPairingError(reasons);
  }

  const codeHash = hashSecret(normalizeCode(params.code));
  const now = new Date();
  const matches = await TvPairingModel.query().where('code_hash', '==', codeHash).where('claimed', '==', false).limit(1).get();
  const pairing = matches[0];
  if (!pairing || pairing.code_expires_at < now.toISOString() || isRevoked(pairing)) {
    throw new InvalidTvPairingError(['This pairing code is invalid or has expired. Ask the TV to display a new one.']);
  }

  pairing.organization_id = params.organizationId;
  pairing.project_id = params.projectId;
  pairing.board_ids = params.boardIds;
  pairing.rotation_seconds = params.rotationSeconds;
  pairing.reduced_motion = params.reducedMotion;
  pairing.label = params.label.trim();
  pairing.claimed = true;
  pairing.claimed_at = now.toISOString();
  pairing.claimed_by = params.claimedByUserId;
  pairing.session_expires_at = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await pairing.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.claimedByUserId,
      action: 'tv_pairing.claim',
      targetType: 'tv_pairing',
      targetId: pairing.id,
      summary: `Paired TV "${pairing.label}"`,
      after: { boardIds: pairing.board_ids, rotationSeconds: pairing.rotation_seconds },
    });
  } catch {
    // Best-effort — audit logging must never turn a successful claim into a failure for the caller.
  }

  return pairing;
}

/** Every pairing claimed for a project (active or revoked) — the admin-facing list. Unclaimed pairings (a TV mid-handshake, or one whose code simply expired unused) never belong to any project and so can never appear here; they're inert Firestore rows with no admin surface to browse them from, the same "buildable-today, not garbage-collected yet" posture other short-lived stand-ins in this codebase (e.g. expired `IngestDedupKeyModel` rows) already accept. */
export async function listTvPairingsForProject(organizationId: string, projectId: string): Promise<TvPairingModel[]> {
  await requireProjectInOrg(organizationId, projectId);
  const pairings = await TvPairingModel.query()
    .where('organization_id', '==', organizationId)
    .where('project_id', '==', projectId)
    .get();
  return pairings.sort((a, b) => (b.claimed_at ?? '').localeCompare(a.claimed_at ?? ''));
}

export interface RevokeTvPairingParams {
  organizationId: string;
  projectId: string;
  pairingId: string;
  revokedByUserId: string;
}

/** Revokes a paired TV immediately (mirrors `revokeApiKey`'s idempotent "safe to retry" shape) — the next poll from that TV (at most `WIN_FEED_POLL_INTERVAL_MS`-scale later for its win feed, or its own rotation-manifest refresh interval for boards/goals) sees `revoked` and must re-pair from scratch. */
export async function revokeTvPairing(params: RevokeTvPairingParams): Promise<TvPairingModel> {
  const pairing = await loadTvPairingInProject(params.organizationId, params.projectId, params.pairingId);
  pairing.revoked_at = new Date().toISOString();
  pairing.revoked_by = params.revokedByUserId;
  await pairing.save();

  try {
    await recordAuditLogEntry({
      organizationId: params.organizationId,
      projectId: params.projectId,
      actorType: 'user',
      actorId: params.revokedByUserId,
      action: 'tv_pairing.revoke',
      targetType: 'tv_pairing',
      targetId: pairing.id,
      summary: `Revoked paired TV "${pairing.label ?? pairing.id}"`,
    });
  } catch {
    // Best-effort — see the comment in claimTvPairing above.
  }

  return pairing;
}
