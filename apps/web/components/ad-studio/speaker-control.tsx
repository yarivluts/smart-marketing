'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Mic, UserRound } from 'lucide-react';
import { AD_STUDIO_SPEAKER_MAX, type AdStudioDelivery } from '@growthos/shared';
import { cn } from '@/lib/utils';

export interface SpeakerControlProps {
  delivery: AdStudioDelivery;
  speaker: string;
  onChange: (next: { delivery: AdStudioDelivery; speaker: string }) => void;
  /** Distinguishes the controls of several scenes on one page. */
  idPrefix: string;
}

/**
 * Who says a scene's narration: an off-screen voice-over (the default) or a person in the shot,
 * lip-synced - and, when the shot has several people, which one ("the lawyer in the blue suit").
 */
export function SpeakerControl({
  delivery,
  speaker,
  onChange,
  idPrefix,
}: SpeakerControlProps): React.ReactElement {
  const t = useTranslations('AdStudio.speaker');
  const options: { id: AdStudioDelivery; icon: typeof Mic }[] = [
    { id: 'voiceover', icon: Mic },
    { id: 'on_screen', icon: UserRound },
  ];
  return (
    <div className="flex flex-col gap-1.5 text-xs" data-testid={`${idPrefix}-speaker`}>
      <span className="font-medium text-muted-foreground">{t('label')}</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('label')}>
        {options.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={delivery === id}
            onClick={() => onChange({ delivery: id, speaker })}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium',
              delivery === id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t(id)}
          </button>
        ))}
      </div>
      {delivery === 'on_screen' ? (
        <label
          className="flex flex-col gap-1 font-medium text-muted-foreground"
          htmlFor={`${idPrefix}-who`}
        >
          {t('who')}
          <input
            id={`${idPrefix}-who`}
            value={speaker}
            maxLength={AD_STUDIO_SPEAKER_MAX}
            onChange={(event) => onChange({ delivery, speaker: event.target.value })}
            placeholder={t('whoPlaceholder')}
            dir="auto"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          />
          <span className="font-normal">{t('whoHint')}</span>
        </label>
      ) : (
        <span className="text-muted-foreground">{t('voiceoverHint')}</span>
      )}
    </div>
  );
}

/** One line saying who speaks, for a scene shown read-only. */
export function SpeakerBadge({
  delivery,
  speaker,
}: {
  delivery?: AdStudioDelivery;
  speaker?: string;
}): React.ReactElement {
  const t = useTranslations('AdStudio.speaker');
  const onScreen = delivery === 'on_screen';
  const Icon = onScreen ? UserRound : Mic;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
      data-testid="ad-studio-speaker-badge"
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {onScreen
        ? speaker?.trim()
          ? t('badgeOnScreen', { who: speaker.trim() })
          : t('badgeOnScreenAny')
        : t('badgeVoiceover')}
    </span>
  );
}
