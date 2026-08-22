'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SEGMENT_WORK_LIST_STATUSES, type SegmentWorkListStatus } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import type { OrgPersonRow } from './create-goal-form';

export interface SegmentWorkListControlsProps {
  orgId: string;
  projectId: string;
  segmentId: string;
  ownerPersonId: string | null;
  status: SegmentWorkListStatus;
  people: OrgPersonRow[];
}

const UNASSIGNED_VALUE = '';

/**
 * Per-segment owner picker + status ticker (KAN-81, E14.x) — the "owner
 * assignment, status ticking" half of plan `14 §Gap 5`'s "live list"
 * upgrade to KAN-76's saved segments. Each control PATCHes independently
 * (an owner change doesn't require re-picking a status and vice versa) and
 * refreshes the list in place, the same `router.refresh()` convention
 * `DeleteSegmentButton` establishes for this page.
 */
export function SegmentWorkListControls({ orgId, projectId, segmentId, ownerPersonId, status, people }: SegmentWorkListControlsProps): React.ReactElement {
  const t = useTranslations('Segments');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>): Promise<void> {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(t('workListUpdateError'));
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground" htmlFor={`segment-owner-${segmentId}`}>
          {t('ownerLabel')}
        </label>
        <select
          id={`segment-owner-${segmentId}`}
          value={ownerPersonId ?? UNASSIGNED_VALUE}
          disabled={pending}
          onChange={(event) => patch({ ownerPersonId: event.target.value.length > 0 ? event.target.value : null })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value={UNASSIGNED_VALUE}>{t('unassignedOption')}</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground" htmlFor={`segment-status-${segmentId}`}>
          {t('statusLabel')}
        </label>
        <select
          id={`segment-status-${segmentId}`}
          value={status}
          disabled={pending}
          onChange={(event) => patch({ status: event.target.value as SegmentWorkListStatus })}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {SEGMENT_WORK_LIST_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`statusOption.${value}`)}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
