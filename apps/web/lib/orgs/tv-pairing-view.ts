import type {
  TvPairingModel,
  TvPairingPowerState,
  TvPairingPendingCommand,
  TvPairingCommandResult,
  TvPairingCecSchedule,
} from '@growthos/firebase-orm-models';

/** A paired TV's own admin-list row — never sends the full `@arbel/firebase-orm` model instance (or its hashed secret fields) to a client component. */
export interface TvPairingSummaryView {
  id: string;
  label: string;
  boardIds: string[];
  rotationSeconds: number;
  reducedMotion: boolean;
  claimedAt: string;
  lastSeenAt?: string;
  sessionExpiresAt?: string;
  revokedAt?: string;
  powerState?: TvPairingPowerState;
  pendingCommand?: TvPairingPendingCommand;
  lastCommandResult?: TvPairingCommandResult;
  cecSchedule?: TvPairingCecSchedule;
}

/** Only ever called for a *claimed* pairing (the admin list only ever shows those — see `listTvPairingsForProject`'s own doc comment), so every field this view needs is guaranteed set. */
export function toTvPairingSummaryView(pairing: TvPairingModel): TvPairingSummaryView {
  return {
    id: pairing.id,
    label: pairing.label ?? '',
    boardIds: pairing.board_ids ?? [],
    rotationSeconds: pairing.rotation_seconds ?? 30,
    reducedMotion: pairing.reduced_motion ?? false,
    claimedAt: pairing.claimed_at ?? '',
    ...(pairing.last_seen_at ? { lastSeenAt: pairing.last_seen_at } : {}),
    ...(pairing.session_expires_at ? { sessionExpiresAt: pairing.session_expires_at } : {}),
    ...(pairing.revoked_at ? { revokedAt: pairing.revoked_at } : {}),
    powerState: pairing.power_state ?? 'on',
    ...(pairing.pending_command ? { pendingCommand: pairing.pending_command } : {}),
    ...(pairing.last_command_result ? { lastCommandResult: pairing.last_command_result } : {}),
    ...(pairing.cec_standby_schedule ? { cecSchedule: pairing.cec_standby_schedule } : {}),
  };
}

