'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Check, ImagePlus, Loader2, Plus, Save, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import {
  AD_STUDIO_MAX_SCENE_REFERENCES,
  AD_STUDIO_MAX_SCENES,
  AD_STUDIO_REFERENCE_USES,
  AD_STUDIO_SCENE_MAX_SECONDS,
  AD_STUDIO_SCENE_MIN_SECONDS,
  isHebrewLanguage,
  validateAdStudioScenes,
  type AdStudioReferenceUse,
  type AdStudioScene,
  type AdStudioSceneIssue,
} from '@growthos/shared';
import type { AdStudioReferenceView } from '@/lib/ad-studio/engine';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { SceneTimeline } from './scene-timeline';
import { MobileAccordionItem } from './mobile-accordion';
import { AddNikudButton } from './add-nikud-button';
import { SpeakerControl } from './speaker-control';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface ScriptEditorProps {
  orgId: string;
  projectId: string;
  briefId: string;
  initialScenes: AdStudioScene[];
  /** The model that wrote the saved script, or null once a person edited it. */
  generatedByModel: string | null;
  /** False when no text model is configured for the deployment. */
  aiAvailable: boolean;
  /** The ad language; Hebrew narration gets a pronunciation (nikud) field. */
  language?: string;
  /** The ad's reference images (app screens, illustrations) a scene can hand to the video model. */
  references?: AdStudioReferenceView[];
}

function newScene(): AdStudioScene {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `scene-${Date.now()}`;
  return { id, durationSeconds: 5, visualPrompt: '', voiceover: '', onScreenText: '' };
}

function issueText(t: ReturnType<typeof useTranslations>, issue: AdStudioSceneIssue): string {
  return t(`issues.${issue.code}`, { scene: issue.scene ?? 0 });
}

/**
 * The script editor: every scene is editable in place, the one-minute ruler and the rule check are
 * live, and the AI either drafts the whole script (after confirming it may replace the current one)
 * or proposes a rewrite of one scene that the person keeps or discards - it never overwrites work
 * silently.
 */
export function ScriptEditor({ orgId, projectId, briefId, initialScenes, generatedByModel, aiAvailable, language = 'en', references = [] }: ScriptEditorProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const [scenes, setScenes] = React.useState<AdStudioScene[]>(initialScenes);
  const [savedJson, setSavedJson] = React.useState(JSON.stringify(initialScenes));
  const [pending, setPending] = React.useState<'save' | 'generate' | null>(null);
  const [confirmReplace, setConfirmReplace] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [activeSceneId, setActiveSceneId] = React.useState<string | null>(null);
  const [rewrite, setRewrite] = React.useState<{ sceneId: string; instruction: string; pending: boolean; proposal: AdStudioScene | null } | null>(null);
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}`;

  React.useEffect(() => {
    setScenes(initialScenes);
    setSavedJson(JSON.stringify(initialScenes));
  }, [initialScenes]);

  const issues = validateAdStudioScenes(scenes);
  const dirty = JSON.stringify(scenes) !== savedJson;
  const hebrew = isHebrewLanguage(language);
  const readyReferences = references.filter((reference) => reference.status === 'ready');
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));

  function setSceneReferences(scene: AdStudioScene, next: { imageId: string; use: AdStudioReferenceUse }[]): void {
    setScenes((current) =>
      current.map((candidate) => {
        if (candidate.id !== scene.id) return candidate;
        const { references: _old, ...rest } = candidate;
        return next.length ? { ...rest, references: next } : rest;
      }),
    );
    setMessage(null);
  }
  const savedById = React.useMemo(() => new Map((JSON.parse(savedJson) as AdStudioScene[]).map((scene) => [scene.id, scene])), [savedJson]);

  /** The narration changed since the save but the pronunciation did not: the server redoes it. */
  function pronunciationStale(scene: AdStudioScene): boolean {
    const saved = savedById.get(scene.id);
    const pronunciation = (scene.pronunciation ?? '').trim();
    return Boolean(saved && pronunciation && saved.voiceover.trim() !== scene.voiceover.trim() && pronunciation === (saved.pronunciation ?? '').trim());
  }

  function update(sceneId: string, patch: Partial<AdStudioScene>): void {
    setScenes((current) => current.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene)));
    setMessage(null);
  }

  function move(index: number, delta: number): void {
    setScenes((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  }

  async function save(): Promise<void> {
    setPending('save');
    setMessage(null);
    try {
      const response = await fetch(`${base}/script`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenes }) });
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError & { brief?: { scenes: AdStudioScene[] } };
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        return;
      }
      // The saved script can differ from what was sent: Hebrew narration comes back vocalized.
      if (body.brief?.scenes) setScenes(body.brief.scenes);
      setSavedJson(JSON.stringify(body.brief?.scenes ?? scenes));
      setMessage({ tone: 'ok', text: t('scriptSaved') });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function generate(): Promise<void> {
    setConfirmReplace(false);
    setPending('generate');
    setMessage(null);
    try {
      const response = await fetch(`${base}/script/generate`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError & { brief?: { scenes: AdStudioScene[] } };
      if (!response.ok || !body.brief) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        return;
      }
      setScenes(body.brief.scenes);
      setSavedJson(JSON.stringify(body.brief.scenes));
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function runRewrite(): Promise<void> {
    if (!rewrite) return;
    setRewrite({ ...rewrite, pending: true, proposal: null });
    setMessage(null);
    try {
      const response = await fetch(`${base}/scenes/${rewrite.sceneId}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: rewrite.instruction }),
      });
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError & { scene?: AdStudioScene };
      if (!response.ok || !body.scene) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        setRewrite((current) => (current ? { ...current, pending: false } : current));
        return;
      }
      setRewrite((current) => (current ? { ...current, pending: false, proposal: body.scene ?? null } : current));
    } catch {
      setRewrite((current) => (current ? { ...current, pending: false } : current));
    }
  }

  function keepProposal(): void {
    if (!rewrite?.proposal) return;
    update(rewrite.sceneId, { ...rewrite.proposal, id: rewrite.sceneId });
    setRewrite(null);
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="ad-studio-script-heading" data-testid="ad-studio-script-editor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="ad-studio-script-heading" className="text-lg font-semibold">
            {t('scriptTitle')}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t('scriptDescription')}</p>
          {scenes.length > 0 ? (
            <p className="text-xs text-muted-foreground">{generatedByModel && !dirty ? t('generatedBy', { model: generatedByModel }) : t('editedAfterAi')}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {confirmReplace ? (
            <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm" role="alertdialog" aria-label={t('rewriteAllConfirm')}>
              <span>{t('rewriteAllConfirm')}</span>
              <button type="button" onClick={generate} className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                {t('confirmReplace')}
              </button>
              <button type="button" onClick={() => setConfirmReplace(false)} className="rounded-lg border border-border px-2.5 py-1 text-xs">
                {t('cancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!aiAvailable || pending !== null}
              onClick={() => (scenes.length > 0 ? setConfirmReplace(true) : generate())}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
            >
              {pending === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {pending === 'generate' ? t('writing') : t('writeWithAi')}
            </button>
          )}
        </div>
      </div>

      <SceneTimeline scenes={scenes} activeSceneId={activeSceneId} />

      {scenes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">{t('noScenesYet')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {scenes.map((scene, index) => {
            const sceneIssues = issues.filter((issue) => issue.scene === index + 1);
            const rewriting = rewrite?.sceneId === scene.id ? rewrite : null;
            return (
              <MobileAccordionItem
                key={scene.id}
                defaultOpen={index === 0 || sceneIssues.length > 0}
                toggleLabel={t('sceneLabel', { number: index + 1 })}
                className={cn('rounded-2xl border bg-card p-4 shadow-sm', sceneIssues.length ? 'border-destructive/50' : 'border-border')}
                bodyClassName="flex flex-col gap-3"
                onFocusCapture={() => setActiveSceneId(scene.id)}
                testId={`ad-studio-scene-${index + 1}`}
                summary={
                  <>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{index + 1}</span>
                    <span className="text-sm font-semibold">{t('sceneLabel', { number: index + 1 })}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{t('secondsShort', { seconds: scene.durationSeconds })}</span>
                    {sceneIssues.length ? <span className="text-xs text-destructive">{t('sceneHasIssues', { count: sceneIssues.length })}</span> : null}
                    {scene.voiceover.trim() ? (
                      <span className="w-full truncate text-xs text-muted-foreground" dir="auto">
                        {scene.voiceover}
                      </span>
                    ) : null}
                  </>
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold max-md:hidden">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{index + 1}</span>
                    {t('sceneLabel', { number: index + 1 })}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-40" aria-label={t('moveUp')}>
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === scenes.length - 1} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-40" aria-label={t('moveDown')}>
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRewrite({ sceneId: scene.id, instruction: '', pending: false, proposal: null })}
                      disabled={!aiAvailable}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-40"
                    >
                      <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('rewriteWithAi')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setScenes((current) => current.filter((candidate) => candidate.id !== scene.id))}
                      className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                      aria-label={t('removeScene')}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[9rem_1fr]">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    {t('duration')}
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={AD_STUDIO_SCENE_MIN_SECONDS}
                        max={AD_STUDIO_SCENE_MAX_SECONDS}
                        step={1}
                        value={Number.isFinite(scene.durationSeconds) ? scene.durationSeconds : AD_STUDIO_SCENE_MIN_SECONDS}
                        onChange={(event) => update(scene.id, { durationSeconds: Number(event.target.value) })}
                        className="w-full accent-[hsl(var(--primary))]"
                        aria-label={t('duration')}
                      />
                      <span className="w-14 shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{t('secondsShort', { seconds: scene.durationSeconds })}</span>
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    {t('visualPrompt')}
                    <textarea
                      value={scene.visualPrompt}
                      onChange={(event) => update(scene.id, { visualPrompt: event.target.value })}
                      rows={2}
                      dir="ltr"
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="font-normal">{t('visualPromptHint')}</span>
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    {t('voiceover')}
                    <textarea
                      value={scene.voiceover}
                      onChange={(event) => update(scene.id, { voiceover: event.target.value })}
                      rows={2}
                      dir="auto"
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    {t('onScreenText')}
                    <input
                      value={scene.onScreenText}
                      onChange={(event) => update(scene.id, { onScreenText: event.target.value })}
                      dir="auto"
                      className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                </div>
                {(hebrew || scene.pronunciation) && scene.voiceover.trim() ? (
                  <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" data-testid={`ad-studio-pronunciation-${index + 1}`}>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={`pronunciation-${scene.id}`}>{t('pronunciation')}</label>
                      {hebrew ? (
                        <AddNikudButton orgId={orgId} projectId={projectId} briefId={briefId} text={scene.voiceover} onVocalized={(pronunciation) => update(scene.id, { pronunciation })} />
                      ) : null}
                    </span>
                    <textarea
                      id={`pronunciation-${scene.id}`}
                      value={scene.pronunciation ?? ''}
                      onChange={(event) => update(scene.id, { pronunciation: event.target.value })}
                      rows={2}
                      dir="auto"
                      lang={hebrew ? 'he' : undefined}
                      className="rounded-xl border border-input bg-background px-3 py-2 text-base leading-relaxed text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className={cn('font-normal', pronunciationStale(scene) ? 'text-warning' : undefined)}>
                      {pronunciationStale(scene) ? t('pronunciationStale') : scene.pronunciation?.trim() ? t('pronunciationHint') : t('pronunciationAuto')}
                    </span>
                  </div>
                ) : null}
                {scene.voiceover.trim() ? (
                  <SpeakerControl
                    idPrefix={`ad-studio-scene-${index + 1}`}
                    delivery={scene.delivery ?? 'voiceover'}
                    speaker={scene.speaker ?? ''}
                    onChange={({ delivery, speaker }) =>
                      update(scene.id, delivery === 'on_screen' ? { delivery, speaker } : { delivery: undefined, speaker: undefined })
                    }
                  />
                ) : null}
                {readyReferences.length || scene.references?.length ? (
                  <div className="flex flex-col gap-2" data-testid={`ad-studio-scene-references-${index + 1}`}>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('references.sceneTitle')}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {(scene.references ?? []).map((attached) => {
                        const reference = referenceById.get(attached.imageId);
                        return (
                          <span key={attached.imageId} className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 py-1 pe-1 ps-1">
                            {reference?.status === 'ready' ? (
                              <img src={`${base}/references/${attached.imageId}/media`} alt="" className="h-8 w-12 rounded object-cover" />
                            ) : null}
                            <span className="max-w-40 truncate text-xs" dir="auto">
                              {reference?.label ?? t('references.missing')}
                            </span>
                            <select
                              aria-label={t('references.useLabel')}
                              value={attached.use}
                              onChange={(event) => setSceneReferences(scene, (scene.references ?? []).map((entry) => (entry.imageId === attached.imageId ? { ...entry, use: event.target.value as AdStudioReferenceUse } : entry)))}
                              className="h-7 rounded-md border border-input bg-background px-1 text-xs"
                            >
                              {AD_STUDIO_REFERENCE_USES.map((use) => (
                                <option key={use} value={use}>
                                  {t(`references.use.${use}`)}
                                </option>
                              ))}
                            </select>
                            <button type="button" onClick={() => setSceneReferences(scene, (scene.references ?? []).filter((entry) => entry.imageId !== attached.imageId))} className="rounded p-1 hover:bg-muted" aria-label={t('references.detach')}>
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </span>
                        );
                      })}
                      {(scene.references?.length ?? 0) < AD_STUDIO_MAX_SCENE_REFERENCES && readyReferences.some((reference) => !scene.references?.some((entry) => entry.imageId === reference.id)) ? (
                        <select
                          aria-label={t('references.attach')}
                          value=""
                          onChange={(event) => event.target.value && setSceneReferences(scene, [...(scene.references ?? []), { imageId: event.target.value, use: 'screen' }])}
                          className="h-8 rounded-lg border border-dashed border-input bg-background px-2 text-xs"
                        >
                          <option value="">{t('references.attach')}</option>
                          {readyReferences
                            .filter((reference) => !scene.references?.some((entry) => entry.imageId === reference.id))
                            .map((reference) => (
                              <option key={reference.id} value={reference.id}>
                                {reference.label}
                              </option>
                            ))}
                        </select>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {rewriting ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="ad-studio-rewrite">
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      {t('rewriteInstruction')}
                      <span className="flex gap-2">
                        <input
                          value={rewriting.instruction}
                          onChange={(event) => setRewrite({ ...rewriting, instruction: event.target.value })}
                          placeholder={t('rewriteInstructionPlaceholder')}
                          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                        />
                        <button type="button" onClick={runRewrite} disabled={rewriting.pending} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                          {rewriting.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}
                          {rewriting.pending ? t('rewriting') : t('rewriteRun')}
                        </button>
                        <button type="button" onClick={() => setRewrite(null)} className="rounded-lg border border-border px-2" aria-label={t('cancel')}>
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </span>
                    </label>
                    {rewriting.proposal ? (
                      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm" data-testid="ad-studio-proposal">
                        <p className="text-xs font-semibold text-primary">{t('proposalTitle')}</p>
                        <p dir="ltr">{rewriting.proposal.visualPrompt}</p>
                        {rewriting.proposal.voiceover ? <p className="text-muted-foreground" dir="auto">{rewriting.proposal.voiceover}</p> : null}
                        {rewriting.proposal.onScreenText ? <p className="font-medium" dir="auto">{rewriting.proposal.onScreenText}</p> : null}
                        <div className="flex gap-2">
                          <button type="button" onClick={keepProposal} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('keepProposal')}
                          </button>
                          <button type="button" onClick={() => setRewrite({ ...rewriting, proposal: null })} className="rounded-lg border border-border px-3 py-1 text-xs">
                            {t('discardProposal')}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {sceneIssues.length ? (
                  <ul className="flex flex-col gap-0.5 text-xs text-destructive">
                    {sceneIssues.map((issue) => (
                      <li key={issue.code}>{issueText(t, issue)}</li>
                    ))}
                  </ul>
                ) : null}
              </MobileAccordionItem>
            );
          })}
        </ol>
      )}

      {issues.filter((issue) => issue.scene === undefined && issue.code !== 'no_scenes').map((issue) => (
        <p key={issue.code} className="text-sm text-destructive">
          {issueText(t, issue)}
        </p>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setScenes((current) => [...current, newScene()])}
          disabled={scenes.length >= AD_STUDIO_MAX_SCENES}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('addScene')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || issues.length > 0 || pending !== null}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {pending === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {pending === 'save' ? t('saving') : t('saveScript')}
        </button>
        {dirty ? <span className="text-xs text-warning">{t('unsavedChanges')}</span> : null}
        {message ? (
          <span role="status" className={cn('text-sm', message.tone === 'ok' ? 'text-success' : 'text-destructive')}>
            {message.text}
          </span>
        ) : null}
      </div>
    </section>
  );
}
