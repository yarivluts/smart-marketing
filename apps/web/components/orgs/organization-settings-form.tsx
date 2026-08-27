'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="org-settings-name">
          {t('nameLabel')}
        </label>
        <Input id="org-settings-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="org-settings-slug">
          {t('slugLabel')}
        </label>
        <Input id="org-settings-slug" value={slug} onChange={(event) => setSlug(event.target.value)} />
        <p className="text-xs text-muted-foreground">{t('slugHelp')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="org-settings-billing-email">
          {t('billingEmailLabel')}
        </label>
        <Input
          id="org-settings-billing-email"
          type="email"
          value={billingEmail}
          onChange={(event) => setBillingEmail(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('billingEmailHelp')}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {saved && !error ? <p className="text-sm text-muted-foreground">{t('saved')}</p> : null}

      <div>
        <Button type="submit" disabled={submitting}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
