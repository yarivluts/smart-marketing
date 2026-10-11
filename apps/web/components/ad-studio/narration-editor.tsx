'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Pencil, Wand2, X } from 'lucide-react';
import {
  AD_STUDIO_PRONUNCIATION_MAX,
  isHebrewLanguage,
  spokenNarration,
  type AdStudioDelivery,
  type AdStudioScene,
} from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';
import { AddNikudButton } from './add-nikud-button';
import { SpeakerBadge, SpeakerControl } from './speaker-control';

export interface NarrationEditorProps {
  orgId: string;
  projectId: string;
  briefId: string;
  /** The whole script: a save sends it back with this scene changed. */
  scenes: AdStudioScene[];
  sceneId: string;
  language: string;
  /** Called with the script as saved (Hebrew narration comes back vocalized). */
  onSaved?: (scenes: AdStudioScene[]) => void;
}

interface Draft {
  visualPrompt: string;
  voiceover: string;
  pronunciation: string;
  delivery: AdStudioDelivery;
  speaker: string;
}

/**
 * A scene's words where its clip is reviewed (KAN-239): what the camera shows, what the narrator
 * reads (with nikud for Hebrew) and who says it, and an editor for all three. "Add nikud" vocalizes
 * the typed narration at once so a vowel can be corrected before saving; a changed narration saved
 * without it comes back vocalized anyway. The AI can suggest a rewrite of the scene, which only
 * changes anything once the person accepts it into the editor and saves. A saved change makes the
 * scene's clip out of date until it is rendered again.
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
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [suggestion, setSuggestion] = React.useState<{
    instruction: string;
    pending: boolean;
    proposal: AdStudioScene | null;
  } | null>(null);
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
        const { pronunciation: _old, delivery: _delivery, speaker: _speaker, ...rest } = entry;
        const pronunciation = draft.pronunciation.trim();
        return {
          ...rest,
          visualPrompt: draft.visualPrompt,
          voiceover: draft.voiceover,
          ...(pronunciation ? { pronunciation } : {}),
          ...(draft.delivery === 'on_screen'
            ? { delivery: draft.delivery, speaker: draft.speaker }
            : {}),
        };
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

  function open(withSuggestion: boolean): void {
    if (!scene) return;
    setMessage(null);
    setDraft({
      visualPrompt: scene.visualPrompt,
      voiceover: scene.voiceover,
      pronunciation: scene.pronunciation ?? '',
      delivery: scene.delivery ?? 'voiceover',
      speaker: scene.speaker ?? '',
    });
    setSuggestion(withSuggestion ? { instruction: '', pending: false, proposal: null } : null);
  }

  /** Asks the AI for a rewrite of this scene; nothing changes until the person accepts it. */
  async function suggest(): Promise<void> {
    if (!suggestion || !scene) return;
    setSuggestion({ ...suggestion, pending: true, proposal: null });
    setMessage(null);
    try {
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/scenes/${scene.id}/rewrite`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: suggestion.instruction }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError & {
        scene?: AdStudioScene;
      };
      if (!response.ok || !body.scene) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        setSuggestion((current) => (current ? { ...current, pending: false } : current));
        return;
      }
      setSuggestion((current) =>
        current ? { ...current, pending: false, proposal: body.scene ?? null } : current,
      );
    } catch {
      setSuggestion((current) => (current ? { ...current, pending: false } : current));
    }
  }

  /** Takes the suggestion into the editor; the person still saves it (and its nikud is redone). */
  function accept(): void {
    if (!suggestion?.proposal || !draft) return;
    const proposal = suggestion.proposal;
    setDraft({
      ...draft,
      visualPrompt: proposal.visualPrompt,
      voiceover: proposal.voiceover,
      pronunciation:
        proposal.voiceover.trim() === draft.voiceover.trim() ? draft.pronunciation : '',
    });
    setSuggestion(null);
  }

  const narrationChanged = draft !== null && draft.voiceover.trim() !== scene.voiceover.trim();
  const nikudStale =
    narrationChanged && draft.pronunciation.trim() === (scene.pronunciation ?? '').trim();

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg bg-muted/40 px-3 py-2"
      data-testid="ad-studio-scene-narration"
    >
      {draft ? (
        <div className="flex flex-col gap-2" data-testid="ad-studio-narration-editor">
          {suggestion ? (
            <div
              className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2"
              data-testid="ad-studio-scene-suggestion"
            >
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                {t('suggestLabel')}
                <span className="flex gap-2">
                  <input
                    value={suggestion.instruction}
                    onChange={(event) =>
                      setSuggestion({ ...suggestion, instruction: event.target.value })
                    }
                    placeholder={t('suggestPlaceholder')}
                    maxLength={500}
                    dir="auto"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => void suggest()}
                    disabled={suggestion.pending}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {suggestion.pending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {suggestion.pending ? t('suggesting') : t('suggestRun')}
                  </button>
                </span>
              </label>
              {suggestion.proposal ? (
                <div
                  className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2 text-xs"
                  data-testid="ad-studio-scene-proposal"
                >
                  <span className="font-semibold text-primary">{t('proposalTitle')}</span>
                  <span className="text-[11px] text-muted-foreground">{t('sceneLabel')}</span>
                  <p dir="ltr">{suggestion.proposal.visualPrompt}</p>
                  <span className="text-[11px] text-muted-foreground">{t('textLabel')}</span>
                  <p className="text-sm" dir="auto" lang={language}>
                    {suggestion.proposal.voiceover || t('none')}
                  </p>
                  <span className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={accept}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('acceptProposal')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSuggestion({ ...suggestion, proposal: null })}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('discardProposal')}
                    </button>
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSuggestion({ instruction: '', pending: false, proposal: null })}
              className="inline-flex items-center gap-1 self-start rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary"
            >
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('suggest')}
            </button>
          )}
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            {t('sceneLabel')}
            <textarea
              rows={3}
              value={draft.visualPrompt}
              onChange={(event) => setDraft({ ...draft, visualPrompt: event.target.value })}
              dir="ltr"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
            <span className="font-normal">{t('sceneHint')}</span>
          </label>
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
          {draft.voiceover.trim() ? (
            <SpeakerControl
              idPrefix={`ad-studio-review-${scene.id}`}
              delivery={draft.delivery}
              speaker={draft.speaker}
              onChange={({ delivery, speaker }) => setDraft({ ...draft, delivery, speaker })}
            />
          ) : null}
          {hebrew && draft.voiceover.trim() ? (
            <div className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`nikud-${scene.id}`}>{t('nikudLabel')}</label>
                <AddNikudButton
                  orgId={orgId}
                  projectId={projectId}
                  briefId={briefId}
                  text={draft.voiceover}
                  onVocalized={(pronunciation) =>
                    setDraft((current) => (current ? { ...current, pronunciation } : current))
                  }
                  disabled={pending}
                />
              </span>
              <textarea
                id={`nikud-${scene.id}`}
                rows={2}
                value={draft.pronunciation}
                maxLength={AD_STUDIO_PRONUNCIATION_MAX}
                onChange={(event) => setDraft({ ...draft, pronunciation: event.target.value })}
                dir="auto"
                lang={language}
                className="rounded-lg border border-input bg-background px-3 py-2 text-base leading-relaxed text-foreground"
              />
              <span className={cn('font-normal', nikudStale && 'text-warning')}>
                {nikudStale ? t('nikudWillRedo') : t('nikudHint')}
              </span>
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={pending || !draft.visualPrompt.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              {pending && hebrew && nikudStale ? t('savingWithNikud') : t('save')}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setSuggestion(null);
              }}
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
            {t('sceneLabel')}
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => open(false)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary hover:bg-primary/10"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                {t('edit')}
              </button>
              <button
                type="button"
                onClick={() => open(true)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary hover:bg-primary/10"
              >
                <Wand2 className="h-3 w-3" aria-hidden="true" />
                {t('suggest')}
              </button>
            </span>
          </span>
          <p className="line-clamp-3 text-sm text-muted-foreground" dir="ltr">
            {scene.visualPrompt}
          </p>
          <span className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
            {vocalized ? t('readWithNikud') : t('label')}
            {scene.voiceover.trim() ? (
              <SpeakerBadge delivery={scene.delivery} speaker={scene.speaker} />
            ) : null}
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
