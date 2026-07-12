import type { TileRenderView } from '@/lib/orgs/board-view';
import type { GoalThermometerView } from '@/lib/orgs/goal-view';
import type { BoardTileRow } from '@/components/orgs/board-types';

// Client-safe request/response shapes for `app/api/tv-pairing/*` — plain
// mirrors of those routes' JSON bodies, not imports from `@growthos/
// firebase-orm-models` (whose barrel drags in server-only code — see
// `board-types.ts`'s own doc comment for why client code never imports that
// package directly).

export interface RequestPairingResponse {
  deviceToken: string;
  code: string;
  codeExpiresAt: string;
}

export type TvPairingStatusResponse =
  | { status: 'pending'; codeExpiresAt: string }
  | { status: 'expired' }
  | { status: 'revoked' }
  | { status: 'invalid' }
  | {
      status: 'claimed';
      organizationId: string;
      projectId: string;
      boardIds: string[];
      rotationSeconds: number;
      reducedMotion: boolean;
      label: string;
    };

export interface TvRotationBoardSummary {
  id: string;
  name: string;
}

export interface TvRotationGoal {
  id: string;
  name: string;
  metricName: string;
  deadline: string;
  thermometer: GoalThermometerView;
}

export interface TvRotationManifest {
  label: string;
  rotationSeconds: number;
  reducedMotion: boolean;
  organizationId: string;
  projectId: string;
  boards: TvRotationBoardSummary[];
  goals: TvRotationGoal[];
}

export interface TvBoardFrame {
  id: string;
  name: string;
  tiles: { tile: BoardTileRow; view: TileRenderView }[];
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function requestTvPairing(): Promise<RequestPairingResponse> {
  const response = await fetch('/api/tv-pairing', { method: 'POST' });
  return parseJsonOrThrow(response);
}

export async function fetchTvPairingStatus(deviceToken: string): Promise<TvPairingStatusResponse> {
  const response = await fetch(`/api/tv-pairing/status?token=${encodeURIComponent(deviceToken)}`);
  return parseJsonOrThrow(response);
}

export async function fetchTvRotationManifest(deviceToken: string): Promise<TvRotationManifest> {
  const response = await fetch(`/api/tv-pairing/rotation?token=${encodeURIComponent(deviceToken)}`);
  return parseJsonOrThrow(response);
}

export async function fetchTvBoardFrame(deviceToken: string, boardId: string): Promise<TvBoardFrame> {
  const response = await fetch(
    `/api/tv-pairing/board?token=${encodeURIComponent(deviceToken)}&boardId=${encodeURIComponent(boardId)}`,
  );
  return parseJsonOrThrow(response);
}

export function tvWinFeedUrl(deviceToken: string): string {
  return `/api/tv-pairing/win-feed?token=${encodeURIComponent(deviceToken)}`;
}
