'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OrgPersonRow } from './create-goal-form';

export interface AssignCustomerOwnerFormProps {
  orgId: string;
  projectId: string;
  people: OrgPersonRow[];
}

/**
 * Assigns a collections owner to a customer id typed by hand (KAN-88).
 * The per-row {@link CustomerOwnerSelect} can only reassign customers that
 * already have a row — which, before a warehouse is configured, means none
 * — so this form is what makes owner assignment reachable at all in the
 * buildable-today state, rather than the feature being invisible until
 * KAN-18 lands.
 */
export function AssignCustomerOwnerForm({ orgId, projectId, people }: AssignCustomerOwnerFormProps): React.ReactElement {
  const t = useTranslations('RepCollections');
  const router = useRouter();
  const [customerId, setCustomerId] = useState('');
  const [ownerPersonId, setOwnerPersonId] = useState(people[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = customerId.trim().length > 0 && ownerPersonId.length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/rep-collections/customers/${encodeURIComponent(customerId.trim())}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerPersonId }),
      });
      if (!response.ok) {
        setError(t('ownerUpdateError'));
        return;
      }
      setCustomerId('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (people.length === 0) {
    return <p className="text-muted-foreground">{t('noPeopleForOwnerAssignment')}</p>;
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="assign-owner-customer-id">
          {t('columnCustomer')}
        </label>
        <Input
          id="assign-owner-customer-id"
          required
          placeholder={t('activityCustomerIdPlaceholder')}
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="assign-owner-person">
          {t('columnOwner')}
        </label>
        <select
          id="assign-owner-person"
          value={ownerPersonId}
          onChange={(event) => setOwnerPersonId(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
        >
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={submitting || !canSubmit}>
        {t('assignOwnerButton')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
