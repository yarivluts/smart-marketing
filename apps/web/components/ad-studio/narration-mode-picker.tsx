'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Mic, UserRound, Users, Wand2 } from 'lucide-react';
import {
  AD_STUDIO_NARRATION_MODES,
  AD_STUDIO_SPEAKER_MAX,
  type AdStudioNarrationMode,
  type AdStudioScene,
} from '@growthos/shared';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface NarrationModePickerProps {
  /** The brief's route base: `/api/orgs/.../ad-studio/briefs/{briefId}`. */
  base: string;
  /** The mode a person or agent chose; null is automatic. */
  mode: AdStudioNarrationMode | null;
  /** The mode the script follows now (what automatic resolved to). */
  effective: AdStudioNarrationMode;
  /** The one person on camera, for `on_camera` (the first one the script names). */
  presenter: string;
  /** Called with the saved brief's mode and script once saved. */
  onSaved: (saved: { mode: AdStudioNarrationMode | null; scenes: AdStudioScene[] | null }) => void;
  disabled?: boolean;
}

type Choice = 'auto' | AdStudioNarrationMode;

const ICONS: Record<Choice, typeof Mic> = { auto: Wand2, voiceover: Mic, on_camera: UserRound, mixed: Users };

/**
 * Who narrates the whole video ad: an off-screen voice-over (the default), one presenter speaking to
 * the camera in every scene, or a per-scene mix. "Automatic" lets the script writer read it from the
 * brief. A new mode is applied to the saved script at once, so the clips it changes go out of date.
 */
export function NarrationModePicker({
  base,
  mode,
  effective,
  presenter,
  onSaved,
  disabled = false,
}: NarrationModePickerProps): React.ReactElement {
  const t = useTranslations('AdStudio.narrationMode');
  const errorMessage = useAdStudioErrorMessage();
  const [choice, setChoice] = React.useState<Choice>(mode ?? 'auto');
  const [who, setWho] = React.useState(presenter);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  React.useEffect(() => setChoice(mode ?? 'auto'), [mode]);
  React.useEffect(() => setWho(presenter), [presenter]);

  const next = choice === 'auto' ? null : choice;
  const presenterChanged = choice === 'on_camera' && who.trim() !== presenter.trim();
  const unchanged = next === mode && !presenterChanged;

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${base}/narration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next, ...(choice === 'on_camera' && who.trim() ? { presenter: who.trim() } : {}) }),
      });
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError & {
        brief?: { narrationMode?: AdStudioNarrationMode | null; scenes?: AdStudioScene[] };
      };
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(result) });
        return;
      }
      onSaved({ mode: result.brief?.narrationMode ?? next, scenes: result.brief?.scenes ?? null });
      setMessage({ tone: 'ok', text: t('saved') });
    } catch {
      setMessage({ tone: 'error', text: errorMessage({}) });
    } finally {
      setSaving(false);
    }
  }

  const options: Choice[] = ['auto', ...AD_STUDIO_NARRATION_MODES];
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-border p-3 text-xs"
      data-testid="ad-studio-narration"
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <UserRound className="h-4 w-4 text-primary" aria-hidden="true" />
        {t('title')}
      </span>
      <span className="text-muted-foreground">{t('hint')}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('title')}>
        {options.map((option) => {
          const Icon = ICONS[option];
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={choice === option}
              disabled={disabled || saving}
              onClick={() => setChoice(option)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium disabled:opacity-50',
                choice === option
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t(`modes.${option}`)}
            </button>
          );
        })}
      </div>
      <span className="text-muted-foreground" data-testid="ad-studio-narration-explain">
        {choice === 'auto'
          ? t('autoNow', { mode: t(`modes.${effective}`) })
          : t(`explain.${choice}`)}
      </span>
      {choice === 'on_camera' ? (
        <label
          className="flex flex-col gap-1 font-medium text-muted-foreground"
          htmlFor="ad-studio-narration-presenter"
        >
          {t('presenterLabel')}
          <input
            id="ad-studio-narration-presenter"
            value={who}
            maxLength={AD_STUDIO_SPEAKER_MAX}
            onChange={(event) => setWho(event.target.value)}
            placeholder={t('presenterPlaceholder')}
            dir="auto"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={disabled || saving || unchanged}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {t('save')}
        </button>
        <span className="text-muted-foreground">{t('outOfDateNote')}</span>
      </div>
      {message ? (
        <p role="status" className={message.tone === 'error' ? 'text-destructive' : 'text-success'}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
