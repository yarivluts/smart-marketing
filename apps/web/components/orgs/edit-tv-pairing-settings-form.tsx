'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BoardSummaryView } from '@/lib/orgs/board-view';

export interface EditTvPairingSettingsFormProps {
  orgId: string;
  projectId: string;
  pairingId: string;
  initialLabel: string;
  initialBoardIds: string[];
  initialRotationSeconds: number;
  initialReducedMotion: boolean;
  boards: BoardSummaryView[];
}

// A client-safe local mirror of `ROTATION_SECONDS_MIN`/`MAX`
// (`tv-pairing.service.ts`, `@growthos/firebase-orm-models` — off-limits to
// client components, see `board-types.ts`'s own doc comment for why), the
// same duplication `ClaimTvPairingForm` already accepts for the same reason.
const ROTATION_SECONDS_MIN = 5;
const ROTATION_SECONDS_MAX = 600;

/**
 * Toggles between a compact "Edit" button and an inline edit form for one
 * paired TV row on the war-room TV admin page (KAN-127 — the same
 * "create + list only, no way to fix a typo'd definition" gap KAN-100/117/
 * 119/120/121/123/124/125/126 already closed for their own sibling
 * registries). Mirrors `ClaimTvPairingForm`'s own label/board-checkboxes/
 * rotation/reduced-motion fields, and `EditHookEndpointForm`'s inline
 * edit-toggle shape. `device_token_hash`/`code_hash`/`claimed`/
 * `organization_id`/`project_id` stay immutable — there is nothing here to
 * edit for them.
 */
export function EditTvPairingSettingsForm({
  orgId,
  projectId,
  pairingId,
  initialLabel,
  initialBoardIds,
  initialRotationSeconds,
  initialReducedMotion,
  boards,
}: EditTvPairingSettingsFormProps): React.ReactElement {
  const t = useTranslations('TvPairing');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(initialLabel);
  const [boardIds, setBoardIds] = useState<string[]>(initialBoardIds);
  const [rotationSeconds, setRotationSeconds] = useState(initialRotationSeconds);
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    label.trim().length > 0 &&
    boardIds.length > 0 &&
    Number.isInteger(rotationSeconds) &&
    rotationSeconds >= ROTATION_SECONDS_MIN &&
    rotationSeconds <= ROTATION_SECONDS_MAX;

  function startEditing(): void {
    setLabel(initialLabel);
    setBoardIds(initialBoardIds);
    setRotationSeconds(initialRotationSeconds);
    setReducedMotion(initialReducedMotion);
    setError(null);
    setEditing(true);
  }

  function toggleBoard(boardId: string): void {
    setBoardIds((current) => (current.includes(boardId) ? current.filter((id) => id !== boardId) : [...current, boardId]));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/tv-pairing/${pairingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, boardIds, rotationSeconds, reducedMotion }),
      });
      if (!response.ok) {
        // 'invalid_tv_pairing' realistically only fires from a race (a board
        // removed from the project between page load and submit) since
        // `canSubmit` already blocks the other `InvalidTvPairingError`
        // reasons (empty board list, out-of-range rotation, empty label)
        // client-side — the same "don't surface hard-coded English service
        // reasons raw" posture `ClaimTvPairingForm`'s own doc comment
        // explains for its sibling `claimErrorInvalidCode` case.
        let errorCode: string | undefined;
        try {
          errorCode = ((await response.json()) as { error?: string }).error;
        } catch {
          // Response body wasn't JSON (or was empty) — fall through to the generic message.
        }
        if (errorCode === 'invalid_tv_pairing') {
          setError(t('editSettingsErrorInvalidBoards'));
        } else if (errorCode === 'revoked') {
          setError(t('editSettingsErrorRevoked'));
        } else {
          setError(t('editSettingsError'));
        }
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={startEditing}>
        {t('editSettings')}
      </Button>
    );
  }

  return (
    <form className="flex w-full flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-tv-pairing-label-${pairingId}`}>
            {t('labelLabel')}
          </label>
          <Input
            id={`edit-tv-pairing-label-${pairingId}`}
            required
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`edit-tv-pairing-rotation-${pairingId}`}>
            {t('rotationSecondsLabel')}
          </label>
          <Input
            id={`edit-tv-pairing-rotation-${pairingId}`}
            type="number"
            min={ROTATION_SECONDS_MIN}
            max={ROTATION_SECONDS_MAX}
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting || !canSubmit}>
          {t('saveSettings')}
        </Button>
        <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>
          {t('cancelEditSettings')}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
