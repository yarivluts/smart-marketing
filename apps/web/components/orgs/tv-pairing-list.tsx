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

/** Every TV currently paired to this project (KAN-67) — label, which boards it rotates through, when it was last seen, an inline settings editor (KAN-127, {@link EditTvPairingSettingsForm}), and a revoke button. Revoking is inlined here (mirrors `RevokeApiKeyButton`'s own fetch-then-refresh shape) rather than its own component, since it's this list's only *inline* mutation — editing settings has its own dedicated fields and so gets its own component, the same split `EditHookEndpointForm`/`DisableHookEndpointButton` establish for hook endpoints. */
export function TvPairingList({ orgId, projectId, pairings, boards }: TvPairingListProps): React.ReactElement {
  const t = useTranslations('TvPairing');
  const router = useRouter();
  const [revokingId, setRevokingId] = useState<string | null>(null);
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

  return (
    <ul className="flex flex-col gap-2">
      {pairings.map((pairing) => (
        <li key={pairing.id} className="flex flex-col gap-2 rounded-md border border-input px-3 py-2 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="font-medium">{pairing.label}</span>
              <span className="text-muted-foreground">
                {pairing.boardIds.map((boardId) => boardNameById.get(boardId) ?? boardId).join(', ')}
              </span>
              <span className="text-muted-foreground">
                {pairing.lastSeenAt ? t('lastSeenLabel', { lastSeenAt: pairing.lastSeenAt }) : t('neverSeenLabel')}
              </span>
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
