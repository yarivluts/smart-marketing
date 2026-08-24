'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { OrgPersonRow } from './create-goal-form';

export interface RepCollectionEntryControlsProps {
  orgId: string;
  projectId: string;
  entryId: string;
  orgPersonId: string | null;
  amount: number;
  people: OrgPersonRow[];
}

const UNASSIGNED_VALUE = '';

/**
 * Per-entry rep picker + amount cell + delete action on the ledger table
 * (KAN-88) — mirrors `SegmentWorkListControls`'s owner-select and
 * `CampaignTargetInput`'s blur-commit amount cell, combined into one row of
 * controls the same way `SegmentWorkListControls` combines its own two
 * independent PATCHes. Company/type/plan/date/note are set once at creation
 * (see `updateRepCollectionEntry`'s own doc comment for why) — only the rep
 * and the amount are inline-editable here.
 */
export function RepCollectionEntryControls({ orgId, projectId, entryId, orgPersonId, amount, people }: RepCollectionEntryControlsProps): React.ReactElement {
  const t = useTranslations('RepCollections');
  const router = useRouter();
  const [amountValue, setAmountValue] = useState(String(amount));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/rep-collections/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(t('updateError'));
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  }

  async function commitAmount(): Promise<void> {
    const trimmed = amountValue.trim();
    const parsed = Number(trimmed);
    if (trimmed.length === 0 || !Number.isFinite(parsed) || parsed <= 0) {
      setError(t('updateError'));
      setAmountValue(String(amount));
      return;
    }
    if (parsed === amount) {
      return;
    }
    const ok = await patch({ amount: parsed });
    if (!ok) {
      setAmountValue(String(amount));
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('deleteConfirm'))) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/rep-collections/${entryId}`, { method: 'DELETE' });
      if (!response.ok) {
        setError(t('deleteError'));
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={t('repLabel')}
        value={orgPersonId ?? UNASSIGNED_VALUE}
        disabled={pending}
        onChange={(event) => patch({ orgPersonId: event.target.value.length > 0 ? event.target.value : null })}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value={UNASSIGNED_VALUE}>{t('unassignedOption')}</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        aria-label={t('amountInputLabel')}
        value={amountValue}
        disabled={pending}
        onChange={(event) => setAmountValue(event.target.value)}
        onBlur={commitAmount}
        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
      />
      <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={handleDelete}>
        {t('deleteButton')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
