'use client';

import React, { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Save, ShieldAlert } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface OrganizationSettingsFormProps {
  orgId: string;
  initialName: string;
  initialSlug: string;
  initialBillingEmail: string;
  onSaved?: () => void;
  className?: string;
}

export function OrganizationSettingsForm({
  orgId,
  initialName,
  initialSlug,
  initialBillingEmail,
  onSaved,
  className = '',
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
      setError('Organization name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), billing_email: billingEmail.trim() }),
      });
      if (!response.ok) {
        setError(t('saveError'));
        return;
      }
      setSaved(true);
      onSaved?.();
      router.refresh();
    } catch {
      setError(t('saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      data-testid="organization-settings-form"
      className={`flex flex-col gap-6 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="flex flex-col gap-1 pb-4 border-b border-border/60">
        <h3 className="text-lg font-bold tracking-tight text-foreground">
          Organization Profile
        </h3>
        <p className="text-xs text-muted-foreground">
          Manage workspace organization name, subdomain slug, and billing notifications.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground" htmlFor="org-settings-name">
            {t('nameLabel')}
          </label>
          <Input
            id="org-settings-name"
            data-testid="org-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-10 text-xs"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground" htmlFor="org-settings-slug">
            {t('slugLabel')}
          </label>
          <Input
            id="org-settings-slug"
            data-testid="org-slug-input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="h-10 text-xs"
          />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-foreground" htmlFor="org-settings-billing-email">
            {t('billingEmailLabel')}
          </label>
          <Input
            id="org-settings-billing-email"
            data-testid="org-billing-email-input"
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            className="h-10 text-xs"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs font-medium text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {saved && !error && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{t('saved')}</span>
        </div>
      )}

      <div className="flex items-center justify-end pt-3 border-t border-border/60">
        <Button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-semibold"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              <span>{t('save')}</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
