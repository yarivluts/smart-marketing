'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { PpButton, PpField, ppInputClass } from '@/components/pastel/primitives';

export interface OrganizationSettingsFormProps {
  orgId: string;
  initialName: string;
  initialSlug: string;
  initialBillingEmail: string;
}

/**
 * The admin surface for an org's own `name`/`slug`/`billing_email`
 * (CLAUDE.md: "anything user-manageable gets an admin surface") — until now
 * these could only ever be set once, at org-creation time, with no way to
 * correct a typo afterward.
 */
export function OrganizationSettingsForm({
  orgId,
  initialName,
  initialSlug,
  initialBillingEmail,
}: OrganizationSettingsFormProps): React.ReactElement {
  const t = useTranslations('OrganizationSettings');
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [billingEmail, setBillingEmail] = useState(initialBillingEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (!name.trim()) {
      setError(t('nameRequiredError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, billingEmail }),
      });
      if (!response.ok) {
        setError(t('saveError'));
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-pp-md" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-pp-md md:grid-cols-2">
        <PpField label={t('nameLabel')} htmlFor="org-settings-name">
          <input
            id="org-settings-name"
            className={ppInputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </PpField>

        <PpField label={t('slugLabel')} htmlFor="org-settings-slug" hint={t('slugHelp')}>
          <input
            id="org-settings-slug"
            className={ppInputClass}
            dir="ltr"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          />
        </PpField>
      </div>

      <PpField label={t('billingEmailLabel')} htmlFor="org-settings-billing-email" hint={t('billingEmailHelp')}>
        <input
          id="org-settings-billing-email"
          type="email"
          dir="ltr"
          className={ppInputClass}
          value={billingEmail}
          onChange={(event) => setBillingEmail(event.target.value)}
        />
      </PpField>

      {error ? (
        <p role="alert" className="rounded-2xl bg-pp-error-container px-pp-md py-2 text-pp-body-md text-pp-on-error-container">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p className="rounded-2xl bg-pp-secondary-container/40 px-pp-md py-2 text-pp-body-md text-pp-on-secondary-container">
          {t('saved')}
        </p>
      ) : null}

      <div className="flex justify-end">
        <PpButton type="submit" icon={Check} disabled={submitting}>
          {t('save')}
        </PpButton>
      </div>
    </form>
  );
}
