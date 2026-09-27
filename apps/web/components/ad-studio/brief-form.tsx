'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { AD_STUDIO_MAX_TOTAL_SECONDS, type AdStudioFormat } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface BriefFormValues {
  name: string;
  objective: string;
  productDescription: string;
  landingPageUrl: string;
  format: AdStudioFormat;
  language: string;
  targetSeconds: number;
}

export interface BriefFormProps {
  orgId: string;
  projectId: string;
  /** Present when editing an existing brief; absent to create one. */
  briefId?: string;
  initial?: BriefFormValues;
  /** The studio page: after creating, the form opens the new brief there (`?brief=<id>`); the edit form stays put. */
  studioHref?: string;
}

const EMPTY: BriefFormValues = { name: '', objective: '', productDescription: '', landingPageUrl: '', format: 'vertical', language: 'en', targetSeconds: 30 };

const inputClass = 'rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring';

/** Creates an ad from a brief, or edits the brief's details. The server validates; its reasons are shown as they come. */
export function BriefForm({ orgId, projectId, briefId, initial = EMPTY, studioHref }: BriefFormProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const [values, setValues] = React.useState<BriefFormValues>(initial);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const set = <K extends keyof BriefFormValues>(key: K, value: BriefFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs`;
      const response = await fetch(briefId ? `${base}/${briefId}` : base, {
        method: briefId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError & { brief?: { id: string } };
      if (!response.ok || !body.brief) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        return;
      }
      if (!briefId && studioHref) {
        router.push(`${studioHref}?brief=${body.brief.id}`);
        return;
      }
      setMessage({ tone: 'ok', text: t('detailsSaved') });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="flex flex-col gap-3" data-testid={briefId ? 'ad-studio-brief-edit' : 'ad-studio-brief-create'}>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t('fieldName')}
        <input value={values.name} onChange={(event) => set('name', event.target.value)} maxLength={120} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t('fieldObjective')}
        <textarea value={values.objective} onChange={(event) => set('objective', event.target.value)} rows={2} maxLength={2000} required placeholder={t('fieldObjectiveHint')} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t('fieldProduct')}
        <textarea value={values.productDescription} onChange={(event) => set('productDescription', event.target.value)} rows={3} maxLength={4000} required placeholder={t('fieldProductHint')} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t('fieldLandingPage')}
        <input value={values.landingPageUrl} onChange={(event) => set('landingPageUrl', event.target.value)} type="url" dir="ltr" placeholder={t('landingPagePlaceholder')} className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('fieldFormat')}
          <select value={values.format} onChange={(event) => set('format', event.target.value as AdStudioFormat)} className={inputClass}>
            <option value="vertical">{t('formatVertical')}</option>
            <option value="horizontal">{t('formatHorizontal')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('fieldLanguage')}
          <select value={values.language} onChange={(event) => set('language', event.target.value)} className={inputClass}>
            <option value="en">{t('languageEn')}</option>
            <option value="he">{t('languageHe')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('fieldLength')}
          <input
            type="number"
            min={5}
            max={AD_STUDIO_MAX_TOTAL_SECONDS}
            step={1}
            value={values.targetSeconds}
            onChange={(event) => set('targetSeconds', Number(event.target.value))}
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? t('saving') : briefId ? t('saveDetails') : t('createButton')}
        </button>
        {message ? (
          <span role="status" className={message.tone === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
