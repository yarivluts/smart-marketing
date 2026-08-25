'use client';

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { AutomationTargetView } from '@/lib/orgs/automation-view';

/** Mirrors `MAX_IMAGE_DATA_URL_LENGTH`/the mime-type allowlist in `@growthos/firebase-orm-models`'s `meta-campaign-draft.ts` — same client-side pre-check `AutomationProposeCampaignDraftForm` already applies before its own file input reaches the server. */
const MAX_IMAGE_FILE_BYTES = 390_000;
const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg'];

export interface AutomationProposeAdCreativeEditFormProps {
  orgId: string;
  projectId: string;
  /** Only targets with at least one Meta ad created (a `campaign_draft_create` action already executed) — see `AutomationTargetView.metaAdResourceNames`. */
  targets: AutomationTargetView[];
}

/** Proposes a KAN-73 follow-up `ad_creative_edit` action — replaces an already-created Meta ad's creative (primary text/headline/description/link/image) with revised content ("post-creation edits beyond activation"). */
export function AutomationProposeAdCreativeEditForm({ orgId, projectId, targets }: AutomationProposeAdCreativeEditFormProps): React.ReactElement | null {
  const t = useTranslations('Automation');
  const router = useRouter();
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [adResourceName, setAdResourceName] = useState(targets[0]?.metaAdResourceNames?.[0] ?? '');
  const [primaryText, setPrimaryText] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('proposeAdCreativeEditNoTargetsNote')}</p>;
  }

  const selectedTarget = targets.find((target) => target.id === targetId) ?? targets[0];
  const adOptions = selectedTarget.metaAdResourceNames ?? [];

  function handleTargetChange(nextTargetId: string): void {
    setTargetId(nextTargetId);
    const nextTarget = targets.find((target) => target.id === nextTargetId);
    setAdResourceName(nextTarget?.metaAdResourceNames?.[0] ?? '');
  }

  function resetForm(): void {
    setPrimaryText('');
    setHeadline('');
    setDescription('');
    setLinkUrl('');
    setImageDataUrl('');
    setImageError(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) {
      setImageDataUrl('');
      setImageError(null);
      return;
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
      setImageDataUrl('');
      setImageError(t('proposeAdCreativeEditImageInvalidTypeError'));
      return;
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      setImageDataUrl('');
      setImageError(t('proposeAdCreativeEditImageTooLargeError'));
      return;
    }
    setImageError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      setImageError(t('proposeAdCreativeEditImageInvalidTypeError'));
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (primaryText.trim().length === 0 || headline.trim().length === 0 || linkUrl.trim().length === 0) {
      setError(t('proposeAdCreativeEditEmptyError'));
      return;
    }
    if (imageError) {
      setError(imageError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/actions/ad-creative-edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId,
          adResourceName,
          creative: {
            primaryText,
            headline,
            ...(description.trim().length > 0 ? { description } : {}),
            linkUrl,
            ...(imageDataUrl ? { imageDataUrl } : {}),
          },
        }),
      });
      if (!response.ok) {
        setError(t('proposeAdCreativeEditError'));
        return;
      }
      resetForm();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ad-creative-edit-target">
            {t('proposeAdCreativeEditTargetLabel')}
          </label>
          <select
            id="ad-creative-edit-target"
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
          <label className="text-sm font-medium" htmlFor="ad-creative-edit-ad">
            {t('proposeAdCreativeEditAdLabel')}
          </label>
          <select
            id="ad-creative-edit-ad"
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
          <label className="text-sm font-medium" htmlFor="ad-creative-edit-primary-text">
            {t('proposeAdCreativeEditPrimaryTextLabel')}
          </label>
          <textarea
            id="ad-creative-edit-primary-text"
            rows={3}
            value={primaryText}
            onChange={(event) => setPrimaryText(event.target.value)}
            className="rounded-md border border-input bg-background p-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ad-creative-edit-headline">
            {t('proposeAdCreativeEditHeadlineLabel')}
          </label>
          <input
            id="ad-creative-edit-headline"
            type="text"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ad-creative-edit-description">
            {t('proposeAdCreativeEditDescriptionLabel')}
          </label>
          <input
            id="ad-creative-edit-description"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ad-creative-edit-link-url">
            {t('proposeAdCreativeEditLinkUrlLabel')}
          </label>
          <input
            id="ad-creative-edit-link-url"
            type="text"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="ad-creative-edit-image">
            {t('proposeAdCreativeEditImageLabel')}
          </label>
          <input
            id="ad-creative-edit-image"
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleImageChange}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground">{t('proposeAdCreativeEditImageHelp')}</p>
          {imageError ? (
            <p role="alert" className="text-xs text-destructive">
              {imageError}
            </p>
          ) : null}
          {imageDataUrl ? (
            <img src={imageDataUrl} alt={t('proposeAdCreativeEditImagePreviewAlt')} className="h-16 w-16 rounded border object-cover" />
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {t('proposeAdCreativeEditButton')}
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
