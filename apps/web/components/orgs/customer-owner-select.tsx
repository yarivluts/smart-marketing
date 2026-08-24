'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { OrgPersonRow } from './create-goal-form';

export interface CustomerOwnerSelectProps {
  orgId: string;
  projectId: string;
  customerId: string;
  ownerPersonId: string | null;
  people: OrgPersonRow[];
}

const UNASSIGNED_VALUE = '';

/**
 * Per-customer collections owner picker (KAN-88) — the same "PATCH on
 * change, `router.refresh()` in place" convention `SegmentWorkListControls`
 * establishes for its own owner picker. Selecting "Unassigned" issues a
 * `DELETE` (reverts to no assignment, the same "no target" posture
 * `CampaignTargetInput` establishes for a cleared budget) rather than a
 * `PATCH` with a null body.
 */
export function CustomerOwnerSelect({ orgId, projectId, customerId, ownerPersonId, people }: CustomerOwnerSelectProps): React.ReactElement {
  const t = useTranslations('RepCollections');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign(newOwnerPersonId: string): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const url = `/api/orgs/${orgId}/projects/${projectId}/rep-collections/customers/${encodeURIComponent(customerId)}`;
      const response =
        newOwnerPersonId.length === 0
          ? await fetch(url, { method: 'DELETE' })
          : await fetch(url, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ownerPersonId: newOwnerPersonId }),
            });
      if (!response.ok) {
        setError(t('ownerUpdateError'));
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={t('ownerSelectLabel', { customerId })}
        value={ownerPersonId ?? UNASSIGNED_VALUE}
        disabled={pending}
        onChange={(event) => assign(event.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value={UNASSIGNED_VALUE}>{t('unassignedOption')}</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
