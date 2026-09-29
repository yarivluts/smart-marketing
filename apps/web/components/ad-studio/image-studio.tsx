'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Download, ImageIcon, Loader2, Plus, RefreshCw, Save, Send, Sparkles, Trash2, Wand2 } from 'lucide-react';
import {
  AD_STUDIO_IMAGE_ASPECT_RATIO,
  AD_STUDIO_IMAGE_FORMATS,
  AD_STUDIO_IMAGE_HEADLINE_MAX,
  AD_STUDIO_IMAGE_INSTRUCTION_MAX,
  AD_STUDIO_MAX_IMAGE_CONCEPTS,
  validateAdStudioImageConcepts,
  type AdStudioImageConcept,
  type AdStudioImageFormat,
} from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { adStudioImageSlots, type AdStudioImageSlot, type AdStudioImageView } from '@/lib/ad-studio/view';
import { useAdStudioErrorMessage, useAdStudioFailureReason, type AdStudioApiError } from './use-ad-studio-error';

type Destination = 'meta' | 'google_ads';

export interface ImageExportRow {
  id: string;
  imageId: string | null;
  destination: string;
  status: 'uploading' | 'done' | 'failed';
  externalId: string | null;
  failureCode: string | null;
}

export interface ImageStudioProps {
  orgId: string;
  projectId: string;
  briefId: string;
  briefName: string;
  language: string;
  initialConcepts: AdStudioImageConcept[];
  initialImages: AdStudioImageView[];
  /** False when no image model (or text model, for ideas) is configured. */
  imagesAvailable: boolean;
  textAvailable: boolean;
  imagesLeftToday: number;
  canExport: boolean;
  destinations: Record<Destination, boolean>;
  exports: ImageExportRow[];
  /** The Plan step: only the ideas are shown and edited; images are rendered after the plan is confirmed. */
  ideasOnly?: boolean;
}

const ASPECT_CLASS: Record<AdStudioImageFormat, string> = {
  square: 'aspect-square',
  portrait: 'aspect-[4/5]',
  story: 'aspect-[9/16] max-h-80',
  landscape: 'aspect-video',
};

type Payload = { concepts?: AdStudioImageConcept[]; images?: AdStudioImageView[] } & AdStudioApiError;

function newConcept(): AdStudioImageConcept {
  return { id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()), visualPrompt: '', headline: '', formats: ['square', 'portrait'] };
}

/**
 * Image ads of one ad: the ideas (what each picture shows, its headline, its placements) written by
 * the AI or a person and editable here, and for each idea and placement the rendered image with its
 * versions - re-render, change by an instruction, pick an older version, download, or send to Meta's
 * image library or Google Ads' asset library. A changed idea marks its images out of date rather than
 * deleting them.
 */
export function ImageStudio(props: ImageStudioProps): React.ReactElement {
  const { orgId, projectId, briefId, briefName, language, imagesAvailable, textAvailable, imagesLeftToday, canExport, destinations, ideasOnly = false } = props;
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const failure = useAdStudioFailureReason();
  const [saved, setSaved] = React.useState(props.initialConcepts);
  const [draft, setDraft] = React.useState(props.initialConcepts);
  const [images, setImages] = React.useState(props.initialImages);
  const [exports, setExports] = React.useState(props.exports);
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [instructions, setInstructions] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState<string | null>(null);
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}`;

  React.useEffect(() => {
    setSaved(props.initialConcepts);
    setDraft(props.initialConcepts);
  }, [props.initialConcepts]);
  React.useEffect(() => setImages(props.initialImages), [props.initialImages]);
  React.useEffect(() => setExports(props.exports), [props.exports]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const issues = validateAdStudioImageConcepts(draft);
  const slots = adStudioImageSlots(saved, images, language);

  async function call(key: string, path: string, init: RequestInit, onOk?: (body: Payload) => void): Promise<boolean> {
    setPending(key);
    setMessage(null);
    try {
      const response = await fetch(`${base}${path}`, init);
      const body = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok) {
        setMessage({ tone: 'error', text: errorMessage(body) });
        return false;
      }
      if (body.concepts) {
        setSaved(body.concepts);
        setDraft(body.concepts);
      }
      if (body.images) setImages(body.images);
      onOk?.(body);
      router.refresh();
      return true;
    } finally {
      setPending(null);
    }
  }

  const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  function update(index: number, patch: Partial<AdStudioImageConcept>): void {
    setDraft((current) => current.map((concept, at) => (at === index ? { ...concept, ...patch } : concept)));
  }

  function toggleFormat(index: number, format: AdStudioImageFormat): void {
    const formats = draft[index].formats;
    update(index, { formats: formats.includes(format) ? formats.filter((entry) => entry !== format) : [...formats, format] });
  }

  async function exportImage(image: AdStudioImageView, destination: Destination, conceptIndex: number): Promise<void> {
    const concept = saved[conceptIndex];
    const title = [briefName, concept?.headline, t(`images.format.${image.format}`)].filter(Boolean).join(' - ').slice(0, 100);
    setPending(`export-${image.id}-${destination}`);
    setMessage(null);
    try {
      const response = await fetch(`${base}/images/${image.id}/export`, json('POST', { destination, title }));
      const body = (await response.json().catch(() => ({}))) as { export?: ImageExportRow; reason?: string } & AdStudioApiError;
      if (body.export) {
        setExports((current) => [{ ...body.export!, imageId: image.id }, ...current]);
        setMessage(
          body.export.status === 'done'
            ? { tone: 'ok', text: t('images.exportDone', { destination: t(`images.destination.${destination}`) }) }
            : { tone: 'error', text: t(`exportFailure.${body.export.failureCode && ['auth_failed', 'quota_exceeded', 'rejected', 'upload_failed', 'no_secret', 'invalid_credential'].includes(body.export.failureCode) ? body.export.failureCode : 'upload_failed'}`) },
        );
      } else if (body.error === 'export_unavailable' && body.reason) {
        setMessage({ tone: 'error', text: t(`exportUnavailable.${body.reason}`) });
      } else {
        setMessage({ tone: 'error', text: errorMessage(body) });
      }
    } finally {
      setPending(null);
    }
  }

  function slotBadge(slot: AdStudioImageSlot): { text: string; tone: string } {
    if (slot.generating) return { text: t('images.state.generating'), tone: 'bg-primary/10 text-primary' };
    if (slot.selected && slot.current) return { text: t('images.state.ready'), tone: 'bg-success/10 text-success' };
    if (slot.selected) return { text: t('images.state.out_of_date'), tone: 'bg-warning/15 text-warning' };
    if (slot.versions[0]?.status === 'failed') return { text: t('images.state.failed'), tone: 'bg-destructive/10 text-destructive' };
    return { text: t('images.state.none'), tone: 'bg-muted text-muted-foreground' };
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="ad-studio-images-heading" data-testid="ad-studio-images">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="ad-studio-images-heading" className="text-lg font-semibold">
              {ideasOnly ? t('images.ideasTitle') : t('images.title')}
            </h2>
            <p className="text-sm text-muted-foreground">{ideasOnly ? t('images.ideasDescription') : t('images.description')}</p>
            {ideasOnly ? null : <p className="text-xs text-muted-foreground">{t('images.leftToday', { count: imagesLeftToday })}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void call('ideas', '/image-concepts/generate', json('POST', {}))}
          disabled={pending !== null || !textAvailable}
          className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {pending === 'ideas' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          {saved.length ? t('images.rewriteIdeas') : t('images.writeIdeas')}
        </button>
      </header>
      {!imagesAvailable ? <p className="text-xs text-warning">{t('images.notConfigured')}</p> : null}

      {draft.length === 0 ? <p className="text-sm text-muted-foreground">{t('images.noIdeas')}</p> : null}
      <ol className="flex flex-col gap-4">
        {draft.map((concept, index) => {
          const savedConcept = saved.find((entry) => entry.id === concept.id);
          const conceptSlots = slots.filter((slot) => slot.conceptId === concept.id);
          const conceptIssues = issues.filter((issue) => issue.concept === index + 1);
          return (
            <li key={concept.id} className="flex flex-col gap-3 rounded-xl border border-border p-4" data-testid={`ad-studio-image-concept-${index + 1}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t('images.ideaLabel', { index: index + 1 })}</span>
                <button
                  type="button"
                  onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('images.removeIdea')}
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  {t('images.visualPrompt')}
                  <textarea
                    value={concept.visualPrompt}
                    onChange={(event) => update(index, { visualPrompt: event.target.value })}
                    rows={3}
                    dir="ltr"
                    className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
                  />
                  <span className="font-normal">{t('images.visualPromptHint')}</span>
                </label>
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    {t('images.headline')}
                    <input
                      value={concept.headline}
                      onChange={(event) => update(index, { headline: event.target.value })}
                      maxLength={AD_STUDIO_IMAGE_HEADLINE_MAX}
                      dir="auto"
                      className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                    />
                  </label>
                  <fieldset className="flex flex-wrap gap-2">
                    <legend className="mb-1 text-xs font-medium text-muted-foreground">{t('images.placements')}</legend>
                    {AD_STUDIO_IMAGE_FORMATS.map((format) => (
                      <button
                        key={format}
                        type="button"
                        aria-pressed={concept.formats.includes(format)}
                        onClick={() => toggleFormat(index, format)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs font-medium',
                          concept.formats.includes(format) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {t(`images.format.${format}`)} <span className="opacity-70">{AD_STUDIO_IMAGE_ASPECT_RATIO[format]}</span>
                      </button>
                    ))}
                  </fieldset>
                </div>
              </div>
              {conceptIssues.length ? (
                <p className="text-xs text-destructive">{conceptIssues.map((issue) => t(`images.issue.${issue.code}`)).join(' · ')}</p>
              ) : null}

              {ideasOnly ? null : savedConcept ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {conceptSlots.map((slot) => {
                    const badge = slotBadge(slot);
                    const shown = slot.selected ?? slot.versions.find((image) => image.status === 'ready') ?? null;
                    const key = `${slot.conceptId}-${slot.format}`;
                    const latestFailed = slot.versions[0]?.status === 'failed' ? slot.versions[0] : null;
                    return (
                      <div key={key} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3" data-testid={`ad-studio-image-slot-${slot.format}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{t(`images.format.${slot.format}`)}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', badge.tone)}>{badge.text}</span>
                        </div>
                        <div className={cn('relative w-full overflow-hidden rounded-lg border border-border bg-muted', ASPECT_CLASS[slot.format])}>
                          {shown ? (
                            // A plain img: private media served by our own authenticated route, not the Next image optimizer.
                            <img src={`${base}/images/${shown.id}/media`} alt={t('images.imageAlt', { index: index + 1, format: t(`images.format.${slot.format}`) })} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              {pending === `render-${key}` || slot.generating ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : t('images.noImageYet')}
                            </div>
                          )}
                        </div>
                        {latestFailed && !slot.generating ? <p className="text-[11px] text-destructive">{failure.image(latestFailed.failureCode)}</p> : null}
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => void call(`render-${key}`, '/images', json('POST', { conceptId: slot.conceptId, format: slot.format }))}
                            disabled={pending !== null || !imagesAvailable || dirty}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {pending === `render-${key}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : shown ? <RefreshCw className="h-3 w-3" aria-hidden="true" /> : <Wand2 className="h-3 w-3" aria-hidden="true" />}
                            {shown ? t('images.rerender') : t('images.render')}
                          </button>
                          {shown ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditing(editing === shown.id ? null : shown.id)}
                                disabled={pending !== null || !imagesAvailable}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                              >
                                <Wand2 className="h-3 w-3" aria-hidden="true" />
                                {t('images.edit')}
                              </button>
                              <a
                                href={`${base}/images/${shown.id}/media`}
                                download
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                              >
                                <Download className="h-3 w-3" aria-hidden="true" />
                                {t('images.download')}
                              </a>
                            </>
                          ) : null}
                        </div>
                        {shown && editing === shown.id ? (
                          <form
                            className="flex flex-col gap-1.5"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void call(`edit-${shown.id}`, `/images/${shown.id}/edit`, json('POST', { instruction: instructions[shown.id] ?? '' }), () => {
                                setEditing(null);
                                setInstructions((current) => ({ ...current, [shown.id]: '' }));
                              });
                            }}
                          >
                            <label className="text-[11px] font-medium text-muted-foreground" htmlFor={`instruction-${shown.id}`}>
                              {t('images.editInstruction')}
                            </label>
                            <textarea
                              id={`instruction-${shown.id}`}
                              value={instructions[shown.id] ?? ''}
                              onChange={(event) => setInstructions((current) => ({ ...current, [shown.id]: event.target.value }))}
                              rows={2}
                              maxLength={AD_STUDIO_IMAGE_INSTRUCTION_MAX}
                              dir="auto"
                              placeholder={t('images.editInstructionPlaceholder')}
                              className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                            />
                            <button
                              type="submit"
                              disabled={pending !== null || !(instructions[shown.id] ?? '').trim()}
                              className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                            >
                              {pending === `edit-${shown.id}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Wand2 className="h-3 w-3" aria-hidden="true" />}
                              {t('images.applyEdit')}
                            </button>
                          </form>
                        ) : null}
                        {slot.versions.filter((image) => image.status === 'ready').length > 1 ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-muted-foreground">{t('images.versions')}</span>
                            <div className="flex flex-wrap gap-1.5">
                              {slot.versions
                                .filter((image) => image.status === 'ready')
                                .map((image) => (
                                  <button
                                    key={image.id}
                                    type="button"
                                    title={image.instruction ?? t('images.versionRender')}
                                    aria-pressed={image.selected}
                                    onClick={() => void call(`select-${image.id}`, `/images/${image.id}/select`, { method: 'POST' })}
                                    disabled={pending !== null || image.selected}
                                    className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', image.selected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}
                                  >
                                    v{image.version}
                                  </button>
                                ))}
                            </div>
                          </div>
                        ) : null}
                        {shown ? (
                          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                            {(['meta', 'google_ads'] as const).map((destination) => {
                              const done = exports.some((row) => row.imageId === shown.id && row.destination === destination && row.status === 'done');
                              return (
                                <button
                                  key={destination}
                                  type="button"
                                  onClick={() => void exportImage(shown, destination, index)}
                                  disabled={pending !== null || !canExport || !destinations[destination]}
                                  title={!destinations[destination] ? t('images.destinationNotConnected') : undefined}
                                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-40"
                                >
                                  {pending === `export-${shown.id}-${destination}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Send className="h-3 w-3" aria-hidden="true" />}
                                  {done ? t('images.exportedTo', { destination: t(`images.destination.${destination}`) }) : t('images.exportTo', { destination: t(`images.destination.${destination}`) })}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('images.saveToRender')}</p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setDraft((current) => [...current, newConcept()])}
          disabled={draft.length >= AD_STUDIO_MAX_IMAGE_CONCEPTS}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('images.addIdea')}
        </button>
        <button
          type="button"
          onClick={() => void call('save', '/image-concepts', json('PUT', { concepts: draft }), () => setMessage({ tone: 'ok', text: t('images.ideasSaved') }))}
          disabled={pending !== null || !dirty || issues.length > 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {t('images.saveIdeas')}
        </button>
        {dirty ? <span className="text-xs text-warning">{t('images.unsaved')}</span> : null}
        {!canExport && !ideasOnly ? <span className="text-xs text-muted-foreground">{t('exportNeedsPermission')}</span> : null}
      </div>
      {message ? (
        <p role="status" className={message.tone === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
