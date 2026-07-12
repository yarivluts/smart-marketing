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
 * `setInterval` is cleared on unmount and whenever the frame list itself
 * changes size (a manifest refresh in `tv-app.tsx` that added/removed a
 * board) — the AC's own "runs 24h without leak" bar applied to the one timer
 * this screen owns.
 */
export function TvRotationScreen({ deviceToken, manifest }: TvRotationScreenProps): React.ReactElement {
  const t = useTranslations('TvMode');
  const frames = buildFrames(manifest);
  const [frameIndex, setFrameIndex] = useState(0);
  const [boardFrame, setBoardFrame] = useState<TvBoardFrame | null>(null);

  useEffect(() => {
    if (frames.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, manifest.rotationSeconds * 1000);
    return () => clearInterval(timer);
  }, [frames.length, manifest.rotationSeconds]);

  const currentFrame = frames[frameIndex % frames.length];

  useEffect(() => {
    setBoardFrame(null);
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
        // A transient fetch failure just leaves this frame blank until the
        // next rotation tick tries again — the same "never a blank board,
        // degrade per-tile" posture already applies one level up inside
        // each tile's own `unavailable` render state; a whole-frame fetch
        // failure is rarer and shorter-lived (one rotation interval) than
        // worth a dedicated retry loop for.
      });
    return () => {
      cancelled = true;
    };
    // `currentFrame` is a derived value re-created every render — keying off
    // its own identity fields (rather than the object itself) avoids
    // re-fetching on every unrelated re-render.
  }, [deviceToken, currentFrame?.kind, currentFrame && currentFrame.kind === 'board' ? currentFrame.boardId : null]);

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
