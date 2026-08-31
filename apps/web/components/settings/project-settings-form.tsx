'use client';

import React, { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Save, ShieldAlert } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface ProjectSettingsFormProps {
  orgId: string;
  projectId: string;
  initialName: string;
  initialVertical: string;
  initialCurrency?: string;
  initialTimezone?: string;
  onSaved?: () => void;
  className?: string;
}

export function ProjectSettingsForm({
  orgId,
  projectId,
  initialName,
  initialVertical,
  initialCurrency = 'USD',
  initialTimezone = 'UTC',
  onSaved,
  className = '',
}: ProjectSettingsFormProps): React.ReactElement {
  const t = useTranslations('ProjectSettings');
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [vertical, setVertical] = useState(initialVertical);
  const [currency, setCurrency] = useState(initialCurrency);
  const [timezone, setTimezone] = useState(initialTimezone);
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
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), vertical: vertical.trim() }),
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
      data-testid="project-settings-form"
      className={`flex flex-col gap-6 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="flex flex-col gap-1 pb-4 border-b border-border/60">
        <h3 className="text-lg font-bold tracking-tight text-foreground">
          General Project Settings
        </h3>
        <p className="text-xs text-muted-foreground">
          Configure project identity, industry vertical, reporting currency, and timezone.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Project Name */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-semibold text-foreground"
            htmlFor="project-settings-name"
          >
            {t('nameLabel')}
          </label>
          <Input
            id="project-settings-name"
            data-testid="project-settings-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. EasySign SaaS"
            required
            className="h-10 text-xs"
          />
        </div>

        {/* Vertical */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-semibold text-foreground"
            htmlFor="project-settings-vertical"
          >
            {t('verticalLabel')}
          </label>
          <Input
            id="project-settings-vertical"
            data-testid="project-settings-vertical-input"
            value={vertical}
            onChange={(event) => setVertical(event.target.value)}
            placeholder="e.g. LegalTech / B2B SaaS"
            className="h-10 text-xs"
          />
          <p className="text-[11px] text-muted-foreground">{t('verticalHelp')}</p>
        </div>

        {/* Reporting Currency */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-semibold text-foreground"
            htmlFor="project-settings-currency"
          >
            Reporting Currency
          </label>
          <select
            id="project-settings-currency"
            data-testid="project-settings-currency-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-xs"
          >
            <option value="USD">USD ($ - US Dollar)</option>
            <option value="EUR">EUR (€ - Euro)</option>
            <option value="ILS">ILS (₪ - Israeli Shekel)</option>
            <option value="GBP">GBP (£ - British Pound)</option>
          </select>
        </div>

        {/* Timezone */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-semibold text-foreground"
            htmlFor="project-settings-timezone"
          >
            Timezone
          </label>
          <select
            id="project-settings-timezone"
            data-testid="project-settings-timezone-select"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-xs"
          >
            <option value="UTC">UTC (Coordinated Universal Time)</option>
            <option value="America/New_York">America/New_York (EST/EDT)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
            <option value="Asia/Jerusalem">Asia/Jerusalem (IST)</option>
            <option value="Europe/London">Europe/London (GMT/BST)</option>
          </select>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs font-medium text-destructive animate-fade-in"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Alert */}
      {saved && !error && (
        <div
          data-testid="project-settings-saved-banner"
          className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 animate-fade-in"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{t('saved')}</span>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex items-center justify-end pt-3 border-t border-border/60">
        <Button
          type="submit"
          data-testid="save-project-settings-btn"
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
