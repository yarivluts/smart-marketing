'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { REP_COLLECTION_TYPES, type RepCollectionType } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { repCollectionTypeLabelKey } from '@/lib/orgs/rep-collection-view';
import type { OrgPersonRow } from './create-goal-form';

export interface CreateRepCollectionEntryFormProps {
  orgId: string;
  projectId: string;
  people: OrgPersonRow[];
  /**
   * When set, this form confirms one `listBillingCollectionSignalsForProject`
   * candidate onto the ledger (KAN-88's "auto from billing" AC half) instead
   * of a blank manual entry — pre-fills company/amount/date from the landed
   * charge (still editable) and threads `rawRecordId` through as
   * `sourceRawRecordId` so the same charge is never suggested again.
   */
  signal?: { rawRecordId: string; amount: number; occurredAt: string; customerId: string };
  /** Called after a successful submit — lets a signal-confirmation form (rendered per-row in a list) hide itself instead of staying mounted with stale props. */
  onSubmitted?: () => void;
}

const UNASSIGNED_VALUE = '';

/**
 * Logs one entry to the rep-attributed collections ledger (KAN-88) — either
 * blank (manual) or seeded from a billing signal, then refreshes the page in
 * place (the ledger table + the signal panel both re-fetch server-side, so a
 * confirmed signal disappears from "Suggested from billing" the same way a
 * synced segment's CRM-run list refreshes elsewhere in this app).
 */
export function CreateRepCollectionEntryForm({ orgId, projectId, people, signal, onSubmitted }: CreateRepCollectionEntryFormProps): React.ReactElement {
  const t = useTranslations('RepCollections');
  const router = useRouter();
  const [orgPersonId, setOrgPersonId] = useState(UNASSIGNED_VALUE);
  const [company, setCompany] = useState(signal?.customerId ?? '');
  const [collectionType, setCollectionType] = useState<RepCollectionType>('upgrade');
  const [planFrom, setPlanFrom] = useState('');
  const [planTo, setPlanTo] = useState('');
  const [amount, setAmount] = useState(signal ? String(signal.amount) : '');
  const [occurredAt, setOccurredAt] = useState(signal?.occurredAt.slice(0, 10) ?? '');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = company.trim().length > 0 && amount.trim().length > 0 && occurredAt.trim().length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/rep-collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgPersonId: orgPersonId.length > 0 ? orgPersonId : null,
          company,
          collectionType,
          planFrom: planFrom.trim().length > 0 ? planFrom : undefined,
          planTo: planTo.trim().length > 0 ? planTo : undefined,
          amount: Number(amount),
          occurredAt,
          note: note.trim().length > 0 ? note : undefined,
          sourceRawRecordId: signal?.rawRecordId,
        }),
      });
      if (!response.ok) {
        setError(t('createError'));
        return;
      }
      setOrgPersonId(UNASSIGNED_VALUE);
      setCompany(signal?.customerId ?? '');
      setPlanFrom('');
      setPlanTo('');
      setAmount(signal ? String(signal.amount) : '');
      setOccurredAt(signal?.occurredAt.slice(0, 10) ?? '');
      setNote('');
      router.refresh();
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`rep-collection-company-${signal?.rawRecordId ?? 'manual'}`}>
            {t('companyLabel')}
          </label>
          <Input
            id={`rep-collection-company-${signal?.rawRecordId ?? 'manual'}`}
            required
            placeholder={t('companyPlaceholder')}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`rep-collection-rep-${signal?.rawRecordId ?? 'manual'}`}>
            {t('repLabel')}
          </label>
          <select
            id={`rep-collection-rep-${signal?.rawRecordId ?? 'manual'}`}
            value={orgPersonId}
            onChange={(event) => setOrgPersonId(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value={UNASSIGNED_VALUE}>{t('unassignedOption')}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`rep-collection-type-${signal?.rawRecordId ?? 'manual'}`}>
            {t('typeLabel')}
          </label>
          <select
            id={`rep-collection-type-${signal?.rawRecordId ?? 'manual'}`}
            value={collectionType}
            onChange={(event) => setCollectionType(event.target.value as RepCollectionType)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {REP_COLLECTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(repCollectionTypeLabelKey(type))}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`rep-collection-plan-from-${signal?.rawRecordId ?? 'manual'}`}>
            {t('planFromLabel')}
          </label>
          <Input
            id={`rep-collection-plan-from-${signal?.rawRecordId ?? 'manual'}`}
            placeholder={t('planFromPlaceholder')}
            value={planFrom}
            onChange={(event) => setPlanFrom(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`rep-collection-plan-to-${signal?.rawRecordId ?? 'manual'}`}>
            {t('planToLabel')}
          </label>
          <Input
            id={`rep-collection-plan-to-${signal?.rawRecordId ?? 'manual'}`}
            placeholder={t('planToPlaceholder')}
            value={planTo}
            onChange={(event) => setPlanTo(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`rep-collection-amount-${signal?.rawRecordId ?? 'manual'}`}>
            {t('amountLabel')}
          </label>
          <Input
            id={`rep-collection-amount-${signal?.rawRecordId ?? 'manual'}`}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={`rep-collection-occurred-at-${signal?.rawRecordId ?? 'manual'}`}>
            {t('occurredAtLabel')}
          </label>
          <Input
            id={`rep-collection-occurred-at-${signal?.rawRecordId ?? 'manual'}`}
            type="date"
            required
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor={`rep-collection-note-${signal?.rawRecordId ?? 'manual'}`}>
          {t('noteLabel')}
        </label>
        <Input
          id={`rep-collection-note-${signal?.rawRecordId ?? 'manual'}`}
          placeholder={t('notePlaceholder')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting || !canSubmit} className="self-start">
        {signal ? t('attributeButton') : t('createButton')}
      </Button>
    </form>
  );
}
