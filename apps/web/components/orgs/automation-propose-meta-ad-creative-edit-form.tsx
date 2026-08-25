'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';

export interface AutomationProposeMetaAdCreativeEditFormProps {
  orgId: string;
  projectId: string;
  /** Only targets with at least one Meta ad created (a `campaign_draft_create` action already executed) — see `AutomationTargetView.metaAdResourceNames`. */
  targets: AutomationTargetView[];
}

/** Proposes a KAN-73 follow-up `meta_ad_creative_edit` action — replaces the primary text/headline/description of a Meta ad an earlier `campaign_draft_create` action already created ("real Meta post-creation creative edit"). */
export function AutomationProposeMetaAdCreativeEditForm({ orgId, projectId, targets }: AutomationProposeMetaAdCreativeEditFormProps): React.ReactElement | null {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [adResourceName, setAdResourceName] = useState(targets[0]?.metaAdResourceNames?.[0] ?? '');
  const [primaryText, setPrimaryText] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('proposeMetaAdCreativeEditNoTargetsNote')}</p>;
  }

  const selectedTarget = targets.find((target) => target.id === targetId) ?? targets[0];
  const adOptions = selectedTarget.metaAdResourceNames ?? [];

  function handleTargetChange(nextTargetId: string): void {
    setTargetId(nextTargetId);
    const nextTarget = targets.find((target) => target.id === nextTargetId);
    setAdResourceName(nextTarget?.metaAdResourceNames?.[0] ?? '');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (primaryText.trim().length === 0 || headline.trim().length === 0 || linkUrl.trim().length === 0) {
      setError(t('proposeMetaAdCreativeEditEmptyError'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/meta-ad-creative-edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          adResourceName,
          primaryText: primaryText.trim(),
          headline: headline.trim(),
          ...(description.trim().length > 0 ? { description: description.trim() } : {}),
          linkUrl: linkUrl.trim(),
        }),
      });
      if (!response.ok) {
        setError(t('proposeMetaAdCreativeEditError'));
        return;
      }
      setPrimaryText('');
      setHeadline('');
      setDescription('');
      setLinkUrl('');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-creative-edit-target">
            {t('proposeMetaAdCreativeEditTargetLabel')}
          </label>
          <select
            id="meta-ad-creative-edit-target"
            value={selectedTarget.id}
            onChange={(event) => handleTargetChange(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-creative-edit-ad">
            {t('proposeMetaAdCreativeEditAdLabel')}
          </label>
          <select
            id="meta-ad-creative-edit-ad"
            value={adResourceName}
            onChange={(event) => setAdResourceName(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            {adOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-creative-edit-link-url">
            {t('proposeMetaAdCreativeEditLinkUrlLabel')}
          </label>
          <Input id="meta-ad-creative-edit-link-url" type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-creative-edit-primary-text">
            {t('proposeMetaAdCreativeEditPrimaryTextLabel')}
          </label>
          <textarea
            id="meta-ad-creative-edit-primary-text"
            rows={3}
            value={primaryText}
            onChange={(event) => setPrimaryText(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-creative-edit-headline">
            {t('proposeMetaAdCreativeEditHeadlineLabel')}
          </label>
          <Input id="meta-ad-creative-edit-headline" value={headline} onChange={(event) => setHeadline(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="meta-ad-creative-edit-description">
            {t('proposeMetaAdCreativeEditDescriptionLabel')}
          </label>
          <Input id="meta-ad-creative-edit-description" value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {t('proposeMetaAdCreativeEditButton')}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
