'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Mic } from 'lucide-react';
import {
  AD_STUDIO_VOICE_DESCRIPTION_MAX,
  AD_STUDIO_VOICE_PRESETS,
  voiceIssue,
  type AdStudioVoice,
} from '@growthos/shared';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface VoicePickerProps {
  /** The brief's route base: `/api/orgs/.../ad-studio/briefs/{briefId}`. */
  base: string;
  voice: AdStudioVoice | null;
  /** Called with the voice once it is saved. */
  onSaved: (voice: AdStudioVoice | null) => void;
  disabled?: boolean;
}

type Choice = 'auto' | AdStudioVoice['preset'];

/**
 * The narrator voice of the whole ad: one choice, used in every scene, so separately rendered
 * scenes sound like the same speaker. "Automatic" lets the video model choose per scene.
 */
export function VoicePicker({
  base,
  voice,
  onSaved,
  disabled = false,
}: VoicePickerProps): React.ReactElement {
  const t = useTranslations('AdStudio.voice');
  const errorMessage = useAdStudioErrorMessage();
  const [choice, setChoice] = React.useState<Choice>(voice?.preset ?? 'auto');
  const [description, setDescription] = React.useState(voice?.description ?? '');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  React.useEffect(() => {
    setChoice(voice?.preset ?? 'auto');
    setDescription(voice?.description ?? '');
  }, [voice]);

  const next: AdStudioVoice | null =
    choice === 'auto'
      ? null
      : choice === 'custom'
        ? { preset: 'custom', description }
        : { preset: choice };
  const issue = next ? voiceIssue(next) : null;
  const unchanged =
    (next?.preset ?? null) === (voice?.preset ?? null) &&
    (choice !== 'custom' || description.trim() === (voice?.description ?? '').trim());

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${base}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: next }),
      });
      const result = (await response.json().catch(() => ({}))) as AdStudioApiError & {
        brief?: { voice?: AdStudioVoice | null };
      };
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(result) });
        return;
      }
      onSaved(result.brief?.voice ?? next);
      setMessage({ tone: 'ok', text: t('saved') });
    } catch {
      setMessage({ tone: 'error', text: errorMessage({}) });
    } finally {
      setSaving(false);
    }
  }

  const options: Choice[] = ['auto', ...AD_STUDIO_VOICE_PRESETS, 'custom'];
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-border p-3 text-xs"
      data-testid="ad-studio-voice"
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Mic className="h-4 w-4 text-primary" aria-hidden="true" />
        {t('title')}
      </span>
      <span className="text-muted-foreground">{t('hint')}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('title')}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={choice === option}
            disabled={disabled || saving}
            onClick={() => setChoice(option)}
            className={cn(
              'rounded-full border px-3 py-1 font-medium disabled:opacity-50',
              choice === option
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {t(`presets.${option}`)}
          </button>
        ))}
      </div>
      {choice === 'custom' ? (
        <label
          className="flex flex-col gap-1 font-medium text-muted-foreground"
          htmlFor="ad-studio-voice-description"
        >
          {t('descriptionLabel')}
          <textarea
            id="ad-studio-voice-description"
            value={description}
            maxLength={AD_STUDIO_VOICE_DESCRIPTION_MAX}
            rows={2}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('descriptionPlaceholder')}
            dir="auto"
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
          <span className="font-normal">{t('descriptionHint')}</span>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={disabled || saving || unchanged || issue !== null}
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
