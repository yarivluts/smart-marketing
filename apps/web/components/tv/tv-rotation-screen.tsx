'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GoalThermometer } from '@/components/orgs/goal-thermometer';
import { BoardTileView } from '@/components/orgs/board-tile-view';
import { WarRoomWinOverlay } from '@/components/tv/war-room-win-overlay';
import { fetchTvBoardFrame, type TvBoardFrame, type TvRotationManifest } from '@/lib/tv/tv-client';

export interface TvRotationScreenProps {
  deviceToken: string;
  manifest: TvRotationManifest;
}

type RotationFrame = { kind: 'board'; boardId: string; name: string } | { kind: 'goals' };

function buildFrames(manifest: TvRotationManifest): RotationFrame[] {
  const boardFrames: RotationFrame[] = manifest.boards.map((board) => ({ kind: 'board', boardId: board.id, name: board.name }));
  return manifest.goals.length > 0 ? [...boardFrames, { kind: 'goals' }] : boardFrames;
}

/**
 * The war-room's own fullscreen rotation (KAN-67 AC: "fullscreen board
 * rotation"): cycles through every paired board plus one goals-thermometer
 * frame, `manifest.rotationSeconds` apart, huge dark-theme typography (plan
 * `10 §2.3`). A board's tile data is fetched on demand the moment its frame
 * becomes current (not all up front) — the same "don't pay for every
 * board's query before it's even shown" reasoning `rotation/route.ts`'s own
 * doc comment gives for keeping tile data out of the manifest fetch itself.
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
      <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
        <p className="text-2xl text-muted-foreground">{t('noFrames')}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col gap-8 bg-background p-12">
      <WarRoomWinOverlay deviceToken={deviceToken} reducedMotion={manifest.reducedMotion} />

      <header className="flex items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight">{manifest.label}</h1>
        <span className="text-lg text-muted-foreground">
          {currentFrame.kind === 'board' ? currentFrame.name : t('goalsFrameHeading')}
        </span>
      </header>

      {currentFrame.kind === 'goals' ? (
        <div className="grid flex-1 grid-cols-2 gap-8">
          {manifest.goals.map((goal) => (
            <section key={goal.id} className="flex flex-col gap-3 rounded-xl border border-input p-6">
              <h2 className="text-2xl font-semibold">{goal.name}</h2>
              <GoalThermometer view={goal.thermometer} />
            </section>
          ))}
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-8">
          {boardFrame === null ? (
            <p className="text-xl text-muted-foreground">{t('loadingBoard')}</p>
          ) : (
            boardFrame.tiles.map(({ tile, view }) => (
              <section key={tile.id} className="flex flex-col gap-3 rounded-xl border border-input p-6">
                <h2 className="text-xl font-semibold">{tile.title}</h2>
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
