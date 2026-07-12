'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BoardSummaryView } from '@/lib/orgs/board-view';

export interface ClaimTvPairingFormProps {
  orgId: string;
  projectId: string;
  boards: BoardSummaryView[];
}

const DEFAULT_ROTATION_SECONDS = 30;

/** Pairs a TV (KAN-67 AC: "device pairing code") by redeeming the code it's currently displaying — pick which board(s) it rotates through, how long each stays on screen, its display label, and whether it opens in reduced-motion mode (plan `10 §4`: "reduced-motion mode (confetti off)"). */
export function ClaimTvPairingForm({ orgId, projectId, boards }: ClaimTvPairingFormProps): React.ReactElement {
  const t = useTranslations('TvPairing');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [rotationSeconds, setRotationSeconds] = useState(DEFAULT_ROTATION_SECONDS);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = code.trim().length > 0 && label.trim().length > 0 && boardIds.length > 0 && rotationSeconds > 0;

  function toggleBoard(boardId: string): void {
    setBoardIds((current) => (current.includes(boardId) ? current.filter((id) => id !== boardId) : [...current, boardId]));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/tv-pairing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), boardIds, rotationSeconds, reducedMotion, label }),
      });
      if (!response.ok) {
        setError(t('claimError'));
        return;
      }
      setCode('');
      setLabel('');
      setBoardIds([]);
      setRotationSeconds(DEFAULT_ROTATION_SECONDS);
      setReducedMotion(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="claim-tv-pairing-code">
            {t('codeLabel')}
          </label>
          <Input
            id="claim-tv-pairing-code"
            required
            placeholder={t('codePlaceholder')}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-32 uppercase tracking-widest"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="claim-tv-pairing-label">
            {t('labelLabel')}
          </label>
          <Input
            id="claim-tv-pairing-label"
            required
            placeholder={t('labelPlaceholder')}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="claim-tv-pairing-rotation">
            {t('rotationSecondsLabel')}
          </label>
          <Input
            id="claim-tv-pairing-rotation"
            type="number"
            min={5}
            max={600}
            required
            value={rotationSeconds}
            onChange={(event) => setRotationSeconds(Number(event.target.value))}
            className="w-24"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('boardsLabel')}</span>
        {boards.map((board) => (
          <label key={board.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={boardIds.includes(board.id)} onChange={() => toggleBoard(board.id)} />
            {board.name}
          </label>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} />
        {t('reducedMotionLabel')}
      </label>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || !canSubmit} className="self-start">
        {t('claimButton')}
      </Button>
    </form>
  );
}
