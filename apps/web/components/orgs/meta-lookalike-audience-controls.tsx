'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MetaLookalikeAudienceView } from '@/lib/orgs/crm-sync-view';

export interface MetaLookalikeAudienceControlsProps {
  orgId: string;
  projectId: string;
  installId: string;
  /** Whether this install already has a seed Custom Audience (`sink_external_ref`) to expand from — a Lookalike needs one, so the create form is only offered once this is true. */
  hasSeedAudience: boolean;
  audiences: readonly MetaLookalikeAudienceView[];
}

const DEFAULT_RATIO_PERCENT = 5;

/**
 * Creates a Meta Lookalike Audience seeded from this install's own already-
 * synced Custom Audience (KAN-73 follow-up, plan `13 §E21.3`'s own "Custom/
 * Lookalike audience creation" bullet). Mirrors `SegmentCrmSyncControls`'
 * shape for the equivalent one-off action, plus a browse list of every
 * Lookalike this install has already created (there is no repeat-sync
 * lifecycle here — see `createMetaLookalikeAudience`'s own doc comment).
 */
export function MetaLookalikeAudienceControls({ orgId, projectId, installId, hasSeedAudience, audiences }: MetaLookalikeAudienceControlsProps): React.ReactElement {
  const t = useTranslations('ProjectPlugins');
  const router = useRouter();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [ratioPercent, setRatioPercent] = useState(DEFAULT_RATIO_PERCENT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/plugins/${installId}/lookalike-audiences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, country: country.toUpperCase(), ratio: ratioPercent / 100 }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      setName('');
      setCountry('');
      setRatioPercent(DEFAULT_RATIO_PERCENT);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('lookalikeIntro')}</p>
      {!hasSeedAudience ? (
        <p className="text-xs text-muted-foreground">{t('lookalikeNoSeedAudience')}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${installId}-lookalike-name`} className="text-xs text-muted-foreground">
              {t('lookalikeNameLabel')}
            </label>
            <Input id={`${installId}-lookalike-name`} value={name} onChange={(event) => setName(event.target.value)} required className="h-9 w-48" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${installId}-lookalike-country`} className="text-xs text-muted-foreground" title={t('lookalikeCountryHint')}>
              {t('lookalikeCountryLabel')}
            </label>
            <Input
              id={`${installId}-lookalike-country`}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              maxLength={2}
              required
              className="h-9 w-16 uppercase"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${installId}-lookalike-ratio`} className="text-xs text-muted-foreground" title={t('lookalikeRatioHint')}>
              {t('lookalikeRatioLabel')}
            </label>
            <Input
              id={`${installId}-lookalike-ratio`}
              type="number"
              min={1}
              max={20}
              step={1}
              value={ratioPercent}
              onChange={(event) => setRatioPercent(Number(event.target.value))}
              required
              className="h-9 w-20"
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={submitting}>
            {t('lookalikeCreateButton')}
          </Button>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('lookalikeCreateError')}
        </p>
      ) : null}

      <details className="flex flex-col gap-2">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{t('lookalikeListHeading')}</summary>
        <div className="pt-2">
          {audiences.length === 0 ? (
            <p className="text-muted-foreground">{t('lookalikeListEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {audiences.map((audience) => (
                <li key={audience.id} className="rounded-md border border-input px-3 py-2 text-xs">
                  {t('lookalikeListItem', { name: audience.name, ratio: Math.round(audience.ratio * 100), country: audience.country, createdAt: audience.createdAt })}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
