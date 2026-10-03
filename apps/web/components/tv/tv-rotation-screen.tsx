'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Radar } from 'lucide-react';
import { GoalThermometer } from '@/components/orgs/goal-thermometer';
import { BoardTileView } from '@/components/orgs/board-tile-view';
import { RepCollectionLeaderboardWidget } from '@/components/orgs/rep-collection-leaderboard-widget';
import { WarRoomWinOverlay } from '@/components/tv/war-room-win-overlay';
import { fetchTvBoardFrame, type TvBoardFrame, type TvRotationManifest } from '@/lib/tv/tv-client';

export interface TvRotationScreenProps {
  deviceToken: string;
  manifest: TvRotationManifest;
}

type RotationFrame = { kind: 'board'; boardId: string; name: string } | { kind: 'goals' } | { kind: 'leaderboard' };

/** A leaderboard frame is only worth a rotation slot once there's something to show — the same "no rows, no unattributed total" empty check `RepCollectionLeaderboardWidget` itself uses to decide whether to render its own empty state. */
function hasLeaderboardData(manifest: TvRotationManifest): boolean {
  return manifest.repCollectionLeaderboard.rows.length > 0 || manifest.repCollectionLeaderboard.unattributedCount > 0;
}

function buildFrames(manifest: TvRotationManifest): RotationFrame[] {
  const boardFrames: RotationFrame[] = manifest.boards.map((board) => ({ kind: 'board', boardId: board.id, name: board.name }));
  const withGoals = manifest.goals.length > 0 ? [...boardFrames, { kind: 'goals' as const }] : boardFrames;
  return hasLeaderboardData(manifest) ? [...withGoals, { kind: 'leaderboard' as const }] : withGoals;
}

/**
 * The war-room's own fullscreen rotation (KAN-67 AC: "fullscreen board
 * rotation"): cycles through every paired board plus one goals-thermometer
 * frame and one rep-collections leaderboard frame (KAN-88's "war-room
 * integration" AC bullet, reusing `RepCollectionLeaderboardWidget` — the same
 * component already shown as a headline widget on the win-rules page — rather
 * than a parallel TV-only rendering), `manifest.rotationSeconds` apart, huge
 * dark-theme typography (plan `10 §2.3`). A board's tile data is fetched on
 * demand the moment its frame becomes current (not all up front) — the same
 * "don't pay for every board's query before it's even shown" reasoning
 * `rotation/route.ts`'s own doc comment gives for keeping tile data out of
 * the manifest fetch itself. The goals and leaderboard frames, by contrast,
 * ride along in the manifest fetch itself — both are already small, single
 * queries the rotation route computes once per poll, unlike a board's tiles.
 *
 * The rotation timer runs even when there's only one frame (a TV paired to a
 * single board with no goals — a common, not edge-case, configuration): it
 * still bumps `refreshTick` every `rotationSeconds`, which the board-fetch
 * effect below also depends on, so that single frame's data keeps refreshing
 * in the background and — critically — a fetch that failed once (a transient
 * network blip, a momentary 401 mid-session-renewal) gets retried on the next
 * tick instead of leaving the screen stuck on `loadingBoard` forever, which a
 * naive "only re-fetch when the frame identity changes" effect would do the
 * moment there's nothing for the identity to change *to*. `setInterval` is
 * cleared on unmount and whenever the frame list itself changes size (a
 * manifest refresh in `tv-app.tsx` that added/removed a board) — the AC's own
 * "runs 24h without leak" bar applied to the one timer this screen owns.
 */
export function TvRotationScreen({ deviceToken, manifest }: TvRotationScreenProps): React.ReactElement {
  const t = useTranslations('TvMode');
  const frames = buildFrames(manifest);
  const [frameIndex, setFrameIndex] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [boardFrame, setBoardFrame] = useState<TvBoardFrame | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshTick((tick) => tick + 1);
      setFrameIndex((current) => (frames.length > 1 ? (current + 1) % frames.length : current));
    }, manifest.rotationSeconds * 1000);
    return () => clearInterval(timer);
  }, [frames.length, manifest.rotationSeconds]);

  const currentFrame = frames[frameIndex % frames.length];
  const currentBoardId = currentFrame && currentFrame.kind === 'board' ? currentFrame.boardId : null;

  // Resets to the loading state only when the *target* board actually
  // changes (a real frame switch) — not on every `refreshTick`, which would
  // otherwise flash "Loading board…" over already-visible data on every
  // single rotation cycle, including ones where nothing changed.
  useEffect(() => {
    setBoardFrame(null);
  }, [currentFrame?.kind, currentBoardId]);

  useEffect(() => {
    if (!currentFrame || currentFrame.kind !== 'board') {
      return;
    }
    let cancelled = false;
    fetchTvBoardFrame(deviceToken, currentFrame.boardId)
      .then((frame) => {
        if (!cancelled) {
          setBoardFrame(frame);
        }
      })
      .catch(() => {
        // A transient fetch failure leaves whatever was last successfully
        // loaded (or `null`/loading, for a first attempt) on screen — the
        // next `refreshTick` retries automatically, see this component's own
        // doc comment.
      });
    return () => {
      cancelled = true;
    };
  }, [deviceToken, refreshTick, currentFrame?.kind, currentBoardId]);

  if (!currentFrame) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-pp-surface p-8 text-center font-pp-body">
        <p className="text-2xl text-pp-outline">{t('noFrames')}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-pp-surface text-pp-on-surface p-6 xl:p-8 2xl:p-10 font-pp-body select-none overflow-hidden">
      <WarRoomWinOverlay deviceToken={deviceToken} reducedMotion={manifest.reducedMotion} />

      {/* Top TV Billboard Bar (Stitch 627edf90) */}
      <header className="flex items-center justify-between bg-pp-surface-container-lowest/90 backdrop-blur-md px-8 py-4 rounded-3xl shadow-pp-candy border border-pp-outline-variant/30">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-brand-gradient flex items-center justify-center text-white shadow-md">
            <Radar className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-pp-display font-black text-2xl tracking-tight text-pp-on-surface">{manifest.label}</h1>
              <span className="px-3 py-0.5 rounded-full bg-pp-on-surface text-pp-surface font-mono text-[11px] font-bold uppercase tracking-wider">
                WAR-ROOM LIVE BILLBOARD
              </span>
            </div>
            <p className="text-[11px] font-semibold text-pp-outline tracking-wide font-mono mt-0.5">
              HIGH-VELOCITY TELEMETRY • HUD /TV
            </p>
          </div>

          <div className="h-7 w-px bg-pp-outline-variant/30 mx-2 hidden sm:block"></div>

          <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-pp-primary-container/10 text-pp-primary border border-pp-primary/20 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-pp-primary"></span>
            <span className="font-mono text-pp-primary text-[10px] opacity-80">me-west1 (Multi-AZ)</span>
          </div>
        </div>

        {/* Right side: live stream indicator & frame label */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-mono font-bold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
            </span>
            <span>Live Stream</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 bg-pp-surface-container-low px-4 py-2 rounded-2xl border border-pp-outline-variant/20 font-mono text-xs text-pp-outline">
            <span className="font-bold text-pp-on-surface">
              {currentFrame.kind === 'board'
                ? currentFrame.name
                : currentFrame.kind === 'goals'
                  ? t('goalsFrameHeading')
                  : t('leaderboardFrameHeading')}
            </span>
          </div>
        </div>
      </header>

      {/* Frame content */}
      {currentFrame.kind === 'goals' ? (
        <div className="grid flex-1 grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
          {manifest.goals.map((goal) => (
            <section
              key={goal.id}
              className="flex flex-col gap-3 rounded-3xl bg-pp-surface-container-lowest p-6 shadow-pp-candy border border-pp-outline-variant/30"
            >
              <h2 className="text-2xl font-bold font-pp-display text-pp-on-surface">{goal.name}</h2>
              <GoalThermometer view={goal.thermometer} />
            </section>
          ))}
        </div>
      ) : currentFrame.kind === 'leaderboard' ? (
        <div className="flex flex-1 items-start">
          <div className="w-full max-w-3xl rounded-3xl bg-pp-surface-container-lowest p-8 shadow-pp-candy border border-pp-outline-variant/30 text-xl [&_h2]:text-3xl [&_li]:text-xl [&_p]:text-lg">
            <RepCollectionLeaderboardWidget view={manifest.repCollectionLeaderboard} />
          </div>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 md:grid-cols-2 gap-6 min-h-0">
          {boardFrame === null ? (
            <div className="col-span-2 flex items-center justify-center p-12">
              <p className="text-xl text-pp-outline font-mono animate-pulse">{t('loadingBoard')}</p>
            </div>
          ) : (
            boardFrame.tiles.map(({ tile, view }) => (
              <section
                key={tile.id}
                className="flex flex-col gap-3 rounded-3xl bg-pp-surface-container-lowest p-6 shadow-pp-candy border border-pp-outline-variant/30"
              >
                <h2 className="text-xl font-bold font-pp-display text-pp-on-surface">{tile.title}</h2>
                <div className="flex-1 text-lg">
                  <BoardTileView tile={tile} view={view} />
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </main>
  );
}
