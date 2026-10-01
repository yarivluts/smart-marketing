'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, SlidersHorizontal } from 'lucide-react';
import {
  AD_STUDIO_AVOID_MAX,
  AD_STUDIO_MUSIC_DESCRIPTION_MAX,
  AD_STUDIO_MUSIC_MODES,
  AD_STUDIO_VIDEO_RESOLUTIONS,
  AD_STUDIO_VISUAL_STYLES,
  isDefaultVideoSettings,
  normalizeVideoSettings,
  videoSettingsIssue,
  type AdStudioVideoSettings,
} from '@growthos/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface AdvancedVideoSettingsProps {
  /** The brief's route base: `/api/orgs/.../ad-studio/briefs/{briefId}`. */
  base: string;
  /** The saved settings, or null for the defaults. */
  settings: AdStudioVideoSettings | null;
  onSaved: (settings: AdStudioVideoSettings | null) => void;
  disabled?: boolean;
}

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
  text,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  text: (value: T) => string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium',
              value === option
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {text(option)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The ad's advanced video settings, in a dialog opened from the video stage: the resolution Gemini
 * Omni renders at, the visual style, the background music and what never to show. Saved for the
 * whole ad; a change makes the clips made with the old settings out of date.
 */
export function AdvancedVideoSettings({
  base,
  settings,
  onSaved,
  disabled = false,
}: AdvancedVideoSettingsProps): React.ReactElement {
  const t = useTranslations('AdStudio.advanced');
  const errorMessage = useAdStudioErrorMessage();
  const saved = normalizeVideoSettings(settings);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<AdStudioVideoSettings>(saved);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openChange(next: boolean): void {
    if (next) {
      setDraft(normalizeVideoSettings(settings));
      setError(null);
    }
    setOpen(next);
  }

  const patch = (change: Partial<AdStudioVideoSettings>) =>
    setDraft((current) => ({ ...current, ...change }));
  const issue = videoSettingsIssue(draft);
  const changed = JSON.stringify(normalizeVideoSettings(draft)) !== JSON.stringify(saved);

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${base}/video-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Empty text is sent, not left out: the route keeps fields that are missing.
        body: JSON.stringify({
          settings: {
            ...draft,
            musicDescription: draft.musicDescription ?? '',
            avoid: draft.avoid ?? '',
          },
        }),
      });
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError & {
        brief?: { videoSettings?: AdStudioVideoSettings | null };
      };
      if (!response.ok) {
        setError(errorMessage(result));
        return;
      }
      onSaved(result.brief?.videoSettings ?? null);
      setOpen(false);
    } catch {
      setError(errorMessage({}));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        data-testid="ad-studio-advanced-open"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        {t('open')}
        {!isDefaultVideoSettings(saved) ? (
          <span className="rounded-full bg-primary/10 px-1.5 text-[11px] text-primary">
            {t('changed')}
          </span>
        ) : null}
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] max-w-xl overflow-y-auto"
        aria-labelledby="ad-studio-advanced-title"
      >
        <DialogHeader>
          <DialogTitle id="ad-studio-advanced-title">{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <Choices
          label={t('resolutionLabel')}
          options={AD_STUDIO_VIDEO_RESOLUTIONS}
          value={draft.resolution}
          onChange={(resolution) => patch({ resolution })}
          text={(value) => t(`resolution.${value}`)}
        />
        <p className="-mt-2 text-xs text-muted-foreground">{t('resolutionHint')}</p>

        <Choices
          label={t('styleLabel')}
          options={AD_STUDIO_VISUAL_STYLES}
          value={draft.style}
          onChange={(style) => patch({ style })}
          text={(value) => t(`style.${value}`)}
        />

        <Choices
          label={t('musicLabel')}
          options={AD_STUDIO_MUSIC_MODES}
          value={draft.music}
          onChange={(music) => patch({ music })}
          text={(value) => t(`music.${value}`)}
        />
        {draft.music === 'custom' ? (
          <label className="-mt-2 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('musicDescriptionLabel')}
            <input
              value={draft.musicDescription ?? ''}
              maxLength={AD_STUDIO_MUSIC_DESCRIPTION_MAX}
              onChange={(event) => patch({ musicDescription: event.target.value })}
              placeholder={t('musicDescriptionPlaceholder')}
              dir="auto"
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('avoidLabel')}
          <textarea
            value={draft.avoid ?? ''}
            maxLength={AD_STUDIO_AVOID_MAX}
            rows={2}
            onChange={(event) => patch({ avoid: event.target.value })}
            placeholder={t('avoidPlaceholder')}
            dir="auto"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground"
          />
          <span className="text-xs font-normal text-muted-foreground">{t('avoidHint')}</span>
        </label>

        <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs">{t('outOfDateNote')}</p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              patch({
                ...normalizeVideoSettings(null),
                musicDescription: undefined,
                avoid: undefined,
              })
            }
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            {t('reset')}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !changed || issue !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {t('save')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
