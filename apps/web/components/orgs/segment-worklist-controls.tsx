'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SEGMENT_STATUSES, type SegmentStatus } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import type { OrgPersonRow } from './create-goal-form';

export interface SegmentWorklistControlsProps {
  orgId: string;
  projectId: string;
  segmentId: string;
  status: SegmentStatus;
  ownerPersonId: string | null;
  people: OrgPersonRow[];
}

/** The `<select>` value standing in for "no owner assigned" — never a real `OrgPersonModel.id`. */
const UNASSIGNED_VALUE = '';

/**
 * Inline per-row worklist controls on the segments list (KAN-81, E14.x,
 * `docs/plan/14-gap-analysis.md` Gap 5: "owner assignment, status
 * ticking") — an owner picker and a status picker, each firing its own
 * `PATCH` on change and refreshing the list in place, the same
 * `router.refresh()`-in-place convention `DeleteSegmentButton` establishes
 * for this same page.
 */
export function SegmentWorklistControls({ orgId, projectId, segmentId, status, ownerPersonId, people }: SegmentWorklistControlsProps): React.ReactElement {
  const t = useTranslations('Segments');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: { ownerPersonId?: string | null; status?: SegmentStatus }): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/segments/${segmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(t('updateError'));
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={t('ownerLabel')}
        value={ownerPersonId ?? UNASSIGNED_VALUE}
        disabled={submitting}
        onChange={(event) => {
          const value = event.target.value;
          void patch({ ownerPersonId: value === UNASSIGNED_VALUE ? null : value });
        }}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value={UNASSIGNED_VALUE}>{t('unassignedOption')}</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
      <select
        aria-label={t('statusLabel')}
        value={status}
        disabled={submitting}
        onChange={(event) => void patch({ status: event.target.value as SegmentStatus })}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        {SEGMENT_STATUSES.map((value) => (
          <option key={value} value={value}>
            {t(`statusOption.${value}`)}
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
