'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil } from 'lucide-react';
import {
  AD_STUDIO_PRONUNCIATION_MAX,
  isHebrewLanguage,
  spokenNarration,
  type AdStudioScene,
} from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface NarrationEditorProps {
  orgId: string;
  projectId: string;
  briefId: string;
  /** The whole script: a save sends it back with this scene's narration changed. */
  scenes: AdStudioScene[];
  sceneId: string;
  language: string;
  /** Called with the script as saved (Hebrew narration comes back vocalized). */
  onSaved?: (scenes: AdStudioScene[]) => void;
}

/**
 * A scene's narration where its clip is reviewed (KAN-239): what the narrator reads (with nikud for
 * Hebrew), and an editor for the words. A changed narration is saved with the script and comes back
 * vocalized - the old nikud belongs to the old words and is redone; a person can still correct a vowel
 * by hand. The scene's clip then reads as out of date until it is rendered again.
 */
export function NarrationEditor({
  orgId,
  projectId,
  briefId,
  scenes,
  sceneId,
  language,
  onSaved,
}: NarrationEditorProps): React.ReactElement | null {
  const t = useTranslations('AdStudio.narration');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const scene = scenes.find((entry) => entry.id === sceneId) ?? null;
  const [draft, setDraft] = React.useState<{ voiceover: string; pronunciation: string } | null>(
    null,
  );
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  if (!scene) return null;
  const hebrew = isHebrewLanguage(language);
  const vocalized = Boolean(scene.pronunciation?.trim());

  async function save(): Promise<void> {
    if (!draft || !scene) return;
    setPending(true);
    setMessage(null);
    try {
      const next = scenes.map((entry) => {
        if (entry.id !== scene.id) return entry;
        const { pronunciation: _old, ...rest } = entry;
        const pronunciation = draft.pronunciation.trim();
        return { ...rest, voiceover: draft.voiceover, ...(pronunciation ? { pronunciation } : {}) };
      });
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/script`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenes: next }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError & {
        brief?: { scenes: AdStudioScene[] };
      };
      if (!response.ok || !body.brief) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        return;
      }
      setDraft(null);
      setMessage({ tone: 'ok', text: t('saved') });
      onSaved?.(body.brief.scenes);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg bg-muted/40 px-3 py-2"
      data-testid="ad-studio-scene-narration"
    >
      {draft ? (
        <div className="flex flex-col gap-2" data-testid="ad-studio-narration-editor">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            {t('textLabel')}
            <textarea
              rows={2}
              value={draft.voiceover}
              onChange={(event) => setDraft({ ...draft, voiceover: event.target.value })}
              dir="auto"
              lang={language}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          {hebrew ? (
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              {t('nikudLabel')}
              <textarea
                rows={2}
                value={draft.pronunciation}
                maxLength={AD_STUDIO_PRONUNCIATION_MAX}
                onChange={(event) => setDraft({ ...draft, pronunciation: event.target.value })}
                dir="auto"
                lang={language}
                className="rounded-lg border border-input bg-background px-3 py-2 text-base leading-relaxed text-foreground"
              />
              <span className="font-normal">
                {draft.voiceover.trim() !== scene.voiceover.trim() &&
                draft.pronunciation.trim() === (scene.pronunciation ?? '').trim()
                  ? t('nikudWillRedo')
                  : t('nikudHint')}
              </span>
            </label>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              {pending && hebrew ? t('savingWithNikud') : t('save')}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
            {vocalized ? t('readWithNikud') : t('label')}
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setDraft({ voiceover: scene.voiceover, pronunciation: scene.pronunciation ?? '' });
              }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary hover:bg-primary/10"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              {t('edit')}
            </button>
          </span>
          {scene.voiceover.trim() ? (
            <p className="text-base leading-relaxed" dir="auto" lang={language}>
              {spokenNarration(scene)}
            </p>
          ) : (
            <p className="text-xs italic text-muted-foreground">{t('none')}</p>
          )}
          {scene.voiceover.trim() && !vocalized && hebrew ? (
            <span className="text-[11px] text-muted-foreground">{t('willVocalize')}</span>
          ) : null}
        </>
      )}
      {message ? (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={cn('text-xs', message.tone === 'ok' ? 'text-success' : 'text-destructive')}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
