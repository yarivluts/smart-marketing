'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { COLLECTION_ACTIVITY_TYPES, type CollectionActivityType } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collectionActivityTypeLabelKey } from '@/lib/orgs/rep-collections-view';
import type { OrgPersonRow } from './create-goal-form';

export interface LogCollectionActivityFormProps {
  orgId: string;
  projectId: string;
  people: OrgPersonRow[];
}

/** Logs one entry to a customer's collections activity ledger (KAN-88's "activity ledger" AC). Mirrors `CreateGoalForm`'s client-form conventions — a plain `POST`, reset on success rather than a navigation (there's no per-activity detail page to go to). */
export function LogCollectionActivityForm({ orgId, projectId, people }: LogCollectionActivityFormProps): React.ReactElement {
  const t = useTranslations('RepCollections');
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [personId, setPersonId] = useState(people[0]?.id ?? '');
  const [activityType, setActivityType] = useState<CollectionActivityType>('call');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = customerId.trim().length > 0 && personId.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/rep-collections/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          personId,
          activityType,
          ...(note.trim().length > 0 ? { note: note.trim() } : {}),
        }),
      });
      if (!response.ok) {
        setError(t('activityLogError'));
        return;
      }
      setCustomerId('');
      setNote('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (people.length === 0) {
    return <p className="text-muted-foreground">{t('noPeopleForActivityLog')}</p>;
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="log-activity-customer-id">
            {t('activityCustomerIdLabel')}
          </label>
          <Input
            id="log-activity-customer-id"
            required
            placeholder={t('activityCustomerIdPlaceholder')}
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="log-activity-person">
            {t('activityPersonLabel')}
          </label>
          <select
            id="log-activity-person"
            value={personId}
            onChange={(event) => setPersonId(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="log-activity-type">
            {t('activityTypeLabel')}
          </label>
          <select
            id="log-activity-type"
            value={activityType}
            onChange={(event) => setActivityType(event.target.value as CollectionActivityType)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {COLLECTION_ACTIVITY_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(collectionActivityTypeLabelKey(value))}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="log-activity-note">
          {t('activityNoteLabel')}
        </label>
        <textarea
          id="log-activity-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          className="flex w-full rounded-xl border border-input bg-background px-3.5 py-2 text-sm shadow-soft ring-offset-background transition-shadow placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || !canSubmit} className="self-start">
        {t('activityLogButton')}
      </Button>
    </form>
  );
}
