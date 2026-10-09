'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EditTvPairingSettingsForm } from '@/components/orgs/edit-tv-pairing-settings-form';
import type { TvPairingSummaryView } from '@/lib/orgs/tv-pairing-view';
import type { BoardSummaryView } from '@/lib/orgs/board-view';

export interface TvPairingListProps {
  orgId: string;
  projectId: string;
  pairings: TvPairingSummaryView[];
  boards: BoardSummaryView[];
}

/**
 * Every TV currently paired to this project (KAN-67, KAN-127, KAN-307) — label,
 * hardware power state ('on' | 'standby' | 'sleep'), pending remote command status,
 * quick remote power/restart controls, which boards it rotates through, when it was last seen,
 * inline settings editor (KAN-127), and revoke button.
 */
export function TvPairingList({ orgId, projectId, pairings, boards }: TvPairingListProps): React.ReactElement {
  const t = useTranslations('TvPairing');
  const router = useRouter();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [commandSendingId, setCommandSendingId] = useState<string | null>(null);
  const [commandFeedback, setCommandFeedback] = useState<{ pairingId: string; type: 'success' | 'error'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boardNameById = new Map(boards.map((board) => [board.id, board.name]));

  async function handleRevoke(pairingId: string): Promise<void> {
    setError(null);
    setRevokingId(pairingId);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/tv-pairing/${pairingId}`, { method: 'DELETE' });
      if (!response.ok) {
        setError(pairingId);
        return;
      }
      router.refresh();
    } finally {
      setRevokingId(null);
    }
  }

  async function handleSendCommand(pairingId: string, type: 'reboot' | 'display_sleep' | 'display_wake' | 'force_reload'): Promise<void> {
    setCommandSendingId(pairingId);
    setCommandFeedback(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/tv-pairing/${pairingId}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!response.ok) {
        setCommandFeedback({ pairingId, type: 'error', message: t('cmdError') });
        return;
      }
      setCommandFeedback({ pairingId, type: 'success', message: t('cmdSuccess') });
      router.refresh();
    } catch {
      setCommandFeedback({ pairingId, type: 'error', message: t('cmdError') });
    } finally {
      setCommandSendingId(null);
    }
  }

  return (
    <ul className="flex flex-col gap-3">
      {pairings.map((pairing) => (
        <li key={pairing.id} className="flex flex-col gap-3 rounded-lg border border-border/80 bg-card p-4 text-sm shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-base text-foreground">{pairing.label}</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    pairing.powerState === 'sleep'
                      ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                      : pairing.powerState === 'standby'
                      ? 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                      : 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      pairing.powerState === 'sleep'
                        ? 'bg-zinc-400'
                        : pairing.powerState === 'standby'
                        ? 'bg-amber-400'
                        : 'bg-emerald-400 animate-pulse'
                    }`}
                  />
                  {pairing.powerState === 'sleep'
                    ? t('powerSleep')
                    : pairing.powerState === 'standby'
                    ? t('powerStandby')
                    : t('powerActive')}
                </span>
                {pairing.pendingCommand ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-sky-950/40 text-sky-300 border border-sky-800/60 animate-pulse font-mono">
                    {t('pendingCommandLabel', { command: pairing.pendingCommand.type })}
                  </span>
                ) : null}
              </div>

              <span className="text-muted-foreground">
                {pairing.boardIds.map((boardId) => boardNameById.get(boardId) ?? boardId).join(', ')}
              </span>

              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                <span>{pairing.lastSeenAt ? t('lastSeenLabel', { lastSeenAt: pairing.lastSeenAt }) : t('neverSeenLabel')}</span>
                {pairing.cecSchedule?.enabled && (
                  <span className="inline-flex items-center gap-1 text-zinc-400 font-mono">
                    {t('cecStandbyActive', {
                      sleepTime: pairing.cecSchedule.sleepTime ?? '20:00',
                      wakeTime: pairing.cecSchedule.wakeTime ?? '08:00',
                    })}
                  </span>
                )}
              </div>

              {error === pairing.id ? (
                <span role="alert" className="text-xs text-destructive">
                  {t('revokeError')}
                </span>
              ) : null}
            </div>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={revokingId === pairing.id}
              onClick={() => handleRevoke(pairing.id)}
            >
              {t('revoke')}
            </Button>
          </div>

          {/* Remote Hardware & Power Command Bar (KAN-307) */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Remote:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={commandSendingId === pairing.id}
              onClick={() => handleSendCommand(pairing.id, pairing.powerState === 'sleep' ? 'display_wake' : 'display_sleep')}
            >
              {pairing.powerState === 'sleep' ? t('cmdWake') : t('cmdSleep')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={commandSendingId === pairing.id}
              onClick={() => handleSendCommand(pairing.id, 'force_reload')}
            >
              {t('cmdReload')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs text-amber-500 hover:text-amber-400"
              disabled={commandSendingId === pairing.id}
              onClick={() => handleSendCommand(pairing.id, 'reboot')}
            >
              {t('cmdReboot')}
            </Button>
            {commandSendingId === pairing.id && (
              <span className="text-xs text-muted-foreground animate-pulse">{t('cmdSending')}</span>
            )}
            {commandFeedback?.pairingId === pairing.id && (
              <span className={`text-xs ${commandFeedback.type === 'error' ? 'text-destructive' : 'text-emerald-500 font-medium'}`}>
                {commandFeedback.message}
              </span>
            )}
          </div>

          <EditTvPairingSettingsForm
            orgId={orgId}
            projectId={projectId}
            pairingId={pairing.id}
            initialLabel={pairing.label}
            initialBoardIds={pairing.boardIds}
            initialRotationSeconds={pairing.rotationSeconds}
            initialReducedMotion={pairing.reducedMotion}
            boards={boards}
          />
        </li>
      ))}
    </ul>
  );
}
