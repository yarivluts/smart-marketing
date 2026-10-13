'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Download,
  ImageIcon,
  Images,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
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
import { AdCopyCard } from './ad-copy-card';
import { useRefreshSafeDraft, useUnsavedChangesGuard } from './use-editor-draft';
import { ServerChangedNotice } from './server-changed-notice';
import { ImageQaNote } from './image-qa-note';
import {
  adStudioImageSlots,
  type AdStudioImageSlot,
  type AdStudioImageView,
} from '@/lib/ad-studio/view';
import {
  useAdStudioErrorMessage,
  useAdStudioFailureReason,
  type AdStudioApiError,
} from './use-ad-studio-error';

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
  /** The advertiser shown in previews: the brand kit's name, else the ad's. */
  advertiser?: string;
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
  /** Review, one idea's own page: only that idea is shown, without the actions on all ideas (they live on the overview). */
  focusConceptId?: string;
  /** The landing page, shown as its domain in the ad previews. */
  linkUrl?: string | null;
}

/** Thumbnail beside each placement's details: the placement's own shape, a fixed width so the cards line up. */
const THUMB_CLASS: Record<AdStudioImageFormat, string> = {
  square: 'aspect-square w-24',
  portrait: 'aspect-[4/5] w-24',
  story: 'aspect-[9/16] w-20',
  landscape: 'aspect-video w-32',
};

type Payload = {
  concepts?: AdStudioImageConcept[];
  images?: AdStudioImageView[];
} & AdStudioApiError;

function newConcept(): AdStudioImageConcept {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : String(Date.now()),
    visualPrompt: '',
    headline: '',
    formats: ['square', 'portrait'],
  };
}

/**
 * Image ads of one ad: the ideas (what each picture shows, its headline, its placements) written by
 * the AI or a person and editable here, and for each idea and placement the rendered image with its
 * versions - re-render, change by an instruction, pick an older version, download, or send to Meta's
 * image library or Google Ads' asset library. A changed idea marks its images out of date rather than
 * deleting them.
 */
export function ImageStudio(props: ImageStudioProps): React.ReactElement {
  const {
    orgId,
    projectId,
    briefId,
    briefName,
    advertiser,
    language,
    imagesAvailable,
    textAvailable,
    imagesLeftToday,
    canExport,
    destinations,
    ideasOnly = false,
    focusConceptId,
    linkUrl = null,
  } = props;
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
  // The one idea being rewritten by an instruction, and that instruction.
  const [ideaRewrite, setIdeaRewrite] = React.useState<{ id: string; instruction: string } | null>(null);
  // Review: show one idea or all of them.
  const [filter, setFilter] = React.useState<string | null>(focusConceptId ?? null);
  const focused = Boolean(focusConceptId);
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}`;

  React.useEffect(() => setImages(props.initialImages), [props.initialImages]);
  React.useEffect(() => setExports(props.exports), [props.exports]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  // Saving copy or anything else refreshes the page: keep unsaved idea edits through it.
  const { serverChanged, reload } = useRefreshSafeDraft(props.initialConcepts, {
    savedJson: JSON.stringify(saved),
    dirty,
    reset: (value) => {
      setSaved(value);
      setDraft(value);
    },
  });
  useUnsavedChangesGuard(dirty, t('editing.leaveUnsaved'));
  const [confirmIdeas, setConfirmIdeas] = React.useState(false);
  const issues = validateAdStudioImageConcepts(draft);
  const slots = adStudioImageSlots(saved, images, language);

  async function call(
    key: string,
    path: string,
    init: RequestInit,
    onOk?: (body: Payload) => void,
  ): Promise<boolean> {
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
    } catch {
      setMessage({ tone: 'error', text: t('errorGeneric') });
      return false;
    } finally {
      setPending(null);
    }
  }

  const json = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  function update(index: number, patch: Partial<AdStudioImageConcept>): void {
    setDraft((current) =>
      current.map((concept, at) => (at === index ? { ...concept, ...patch } : concept)),
    );
  }

  function toggleFormat(index: number, format: AdStudioImageFormat): void {
    const formats = draft[index].formats;
    update(index, {
      formats: formats.includes(format)
        ? formats.filter((entry) => entry !== format)
        : [...formats, format],
    });
  }

  async function exportImage(
    image: AdStudioImageView,
    destination: Destination,
    conceptIndex: number,
  ): Promise<void> {
    const concept = saved[conceptIndex];
    const title = [briefName, concept?.headline, t(`images.format.${image.format}`)]
      .filter(Boolean)
      .join(' - ')
      .slice(0, 100);
    setPending(`export-${image.id}-${destination}`);
    setMessage(null);
    try {
      const response = await fetch(
        `${base}/images/${image.id}/export`,
        json('POST', { destination, title }),
      );
      const body = (await response.json().catch(() => ({}))) as {
        export?: ImageExportRow;
        reason?: string;
      } & AdStudioApiError;
      if (body.export) {
        setExports((current) => [{ ...body.export!, imageId: image.id }, ...current]);
        setMessage(
          body.export.status === 'done'
            ? {
                tone: 'ok',
                text: t('images.exportDone', {
                  destination: t(`images.destination.${destination}`),
                }),
              }
            : {
                tone: 'error',
                text: t(
                  `exportFailure.${body.export.failureCode && ['auth_failed', 'quota_exceeded', 'rejected', 'upload_failed', 'no_secret', 'invalid_credential'].includes(body.export.failureCode) ? body.export.failureCode : 'upload_failed'}`,
                ),
              },
        );
      } else if (body.error === 'export_unavailable' && body.reason) {
        setMessage({ tone: 'error', text: t(`exportUnavailable.${body.reason}`) });
      } else {
        setMessage({ tone: 'error', text: errorMessage(body) });
      }
    } catch {
      setMessage({ tone: 'error', text: t('errorGeneric') });
    } finally {
      setPending(null);
    }
  }

  function slotBadge(slot: AdStudioImageSlot): { text: string; tone: string } {
    if (slot.generating)
      return { text: t('images.state.generating'), tone: 'bg-primary/10 text-primary' };
    if (slot.selected && slot.current)
      return { text: t('images.state.ready'), tone: 'bg-success/10 text-success' };
    if (slot.selected)
      return { text: t('images.state.out_of_date'), tone: 'bg-warning/15 text-warning' };
    if (slot.versions[0]?.status === 'failed')
      return { text: t('images.state.failed'), tone: 'bg-destructive/10 text-destructive' };
    return { text: t('images.state.none'), tone: 'bg-muted text-muted-foreground' };
  }

  // Review-step summary, from the real images only: what the AI check passed, what needs a look, what is ready.
  const checked = slots.flatMap((slot) => (slot.selected?.qa && (slot.selected.qa.status === 'passed' || slot.selected.qa.status === 'issues') ? [slot.selected.qa] : []));
  const passedCount = checked.filter((qa) => qa.status === 'passed').length;
  const readyCount = slots.filter((slot) => slot.selected?.status === 'ready' && slot.current).length;
  const attentionCount = slots.filter(
    (slot) =>
      !slot.generating &&
      (slot.selected?.qa?.status === 'issues' || (slot.selected && !slot.current) || (!slot.selected && slot.versions[0]?.status === 'failed')),
  ).length;
  const summary = [
    { key: 'passed', icon: ShieldCheck, label: t('images.kpi.passed'), value: checked.length ? t('images.kpi.ofValue', { count: passedCount, total: checked.length }) : t('images.kpi.notChecked'), tone: 'bg-success/10 text-success' },
    { key: 'attention', icon: AlertTriangle, label: t('images.kpi.attention'), value: String(attentionCount), tone: attentionCount ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground' },
    { key: 'ready', icon: ImageIcon, label: t('images.kpi.ready'), value: t('images.kpi.ofValue', { count: readyCount, total: slots.length }), tone: 'bg-primary/10 text-primary' },
    { key: 'left', icon: Zap, label: t('images.kpi.left'), value: String(imagesLeftToday), tone: 'bg-muted text-muted-foreground' },
  ];

  function renderSlot(slot: AdStudioImageSlot, index: number): React.ReactElement {
    const badge = slotBadge(slot);
    const shown = slot.selected ?? slot.versions.find((image) => image.status === 'ready') ?? null;
    const key = `${slot.conceptId}-${slot.format}`;
    const latestFailed = slot.versions[0]?.status === 'failed' ? slot.versions[0] : null;
    const readyVersions = slot.versions.filter((image) => image.status === 'ready');
    return (
      <div key={key} className="flex flex-col gap-3 rounded-2xl bg-muted/40 p-3" data-testid={`ad-studio-image-slot-${slot.format}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">
            {t(`images.format.${slot.format}`)} <span className="font-normal text-muted-foreground">{AD_STUDIO_IMAGE_ASPECT_RATIO[slot.format]}</span>
          </span>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', badge.tone)}>{badge.text}</span>
        </div>
        <div className="flex items-start gap-3">
          <div className={cn('relative shrink-0 overflow-hidden rounded-xl border border-border bg-muted', THUMB_CLASS[slot.format])}>
            {shown ? (
              // A plain img: private media served by our own authenticated route, not the Next image optimizer.
              <a href={`${base}/images/${shown.id}/media`} target="_blank" rel="noreferrer" title={t('images.openFull')}>
                <img
                  src={`${base}/images/${shown.id}/media`}
                  alt={t('images.imageAlt', { index: index + 1, format: t(`images.format.${slot.format}`) })}
                  className="h-full w-full object-cover"
                />
              </a>
            ) : (
              <div className="flex h-full w-full items-center justify-center p-1 text-center text-[11px] text-muted-foreground">
                {pending === `render-${key}` || slot.generating ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : t('images.noImageYet')}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {shown ? <ImageQaNote qa={shown.qa} /> : null}
            {latestFailed && !slot.generating ? <p className="text-[11px] text-destructive">{failure.image(latestFailed.failureCode)}</p> : null}
            {shown ? (
              <span className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                {[`v${shown.version}`, shown.imageSize].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </div>
        </div>
        <div className={cn('grid gap-1.5', shown ? 'grid-cols-2' : 'grid-cols-1')}>
          <button
            type="button"
            onClick={() => void call(`render-${key}`, '/images', json('POST', { conceptId: slot.conceptId, format: slot.format }))}
            disabled={pending !== null || !imagesAvailable || dirty}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {pending === `render-${key}` ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : shown ? (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {shown ? t('images.rerender') : t('images.render')}
          </button>
          {shown ? (
            <button
              type="button"
              onClick={() => setEditing(editing === shown.id ? null : shown.id)}
              disabled={pending !== null || !imagesAvailable}
              aria-expanded={editing === shown.id}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium shadow-sm hover:bg-muted disabled:opacity-50"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              {t('images.edit')}
            </button>
          ) : null}
        </div>
        {shown && editing === shown.id ? (
          <form
            className="flex flex-col gap-1.5 rounded-xl border border-primary/30 bg-primary/5 p-2"
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
              className="inline-flex h-8 items-center justify-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {pending === `edit-${shown.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}
              {t('images.applyEdit')}
            </button>
          </form>
        ) : null}
        {readyVersions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">{t('images.versions')}</span>
            {readyVersions.map((image) => (
              <button
                key={image.id}
                type="button"
                title={image.instruction ?? t('images.versionRender')}
                aria-pressed={image.selected}
                onClick={() => void call(`select-${image.id}`, `/images/${image.id}/select`, { method: 'POST' })}
                disabled={pending !== null || image.selected}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  image.selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card hover:bg-muted',
                )}
              >
                v{image.version}
              </button>
            ))}
          </div>
        ) : null}
        {shown ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/60 pt-2 text-[11px]">
            <a href={`${base}/images/${shown.id}/media`} download className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-primary">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {t('images.download')}
            </a>
            {(['meta', 'google_ads'] as const).map((destination) => {
              const done = exports.some((row) => row.imageId === shown.id && row.destination === destination && row.status === 'done');
              return (
                <button
                  key={destination}
                  type="button"
                  onClick={() => void exportImage(shown, destination, index)}
                  disabled={pending !== null || !canExport || !destinations[destination]}
                  title={!destinations[destination] ? t('images.destinationNotConnected') : undefined}
                  className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-primary disabled:opacity-40 disabled:hover:text-muted-foreground"
                >
                  {pending === `export-${shown.id}-${destination}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                  {done
                    ? t('images.exportedTo', { destination: t(`images.destination.${destination}`) })
                    : t('images.exportTo', { destination: t(`images.destination.${destination}`) })}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  const writeIdeasButton = confirmIdeas ? (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm" role="alertdialog" aria-label={t('images.rewriteIdeasConfirm')}>
      <span>{t('images.rewriteIdeasConfirm')}</span>
      <button
        type="button"
        autoFocus
        onClick={() => {
          setConfirmIdeas(false);
          void call('ideas', '/image-concepts/generate', json('POST', {}));
        }}
        className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
      >
        {t('confirmReplace')}
      </button>
      <button type="button" onClick={() => setConfirmIdeas(false)} className="rounded-full border border-border px-3 py-1 text-xs">
        {t('cancel')}
      </button>
    </div>
  ) : (
    <button
      type="button"
      // Rewriting replaces every idea, its copy and the link to its rendered images: ask first.
      onClick={() => (saved.length ? setConfirmIdeas(true) : void call('ideas', '/image-concepts/generate', json('POST', {})))}
      disabled={pending !== null || !textAvailable}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 disabled:opacity-50"
    >
      {pending === 'ideas' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
      {saved.length ? t('images.rewriteIdeas') : t('images.writeIdeas')}
    </button>
  );

  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby="ad-studio-images-heading" data-testid="ad-studio-images">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="ad-studio-images-heading" className="font-pp-display text-xl font-semibold tracking-tight">
                {ideasOnly ? t('images.ideasTitle') : t('images.title')}
              </h2>
              {ideasOnly ? null : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                  {t('images.leftToday', { count: imagesLeftToday })}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{ideasOnly ? t('images.ideasDescription') : t('images.description')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!ideasOnly && !focused && saved.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1 rounded-full bg-muted p-1" role="group" aria-label={t('images.filterLabel')} data-testid="ad-studio-idea-filter">
              {[null, ...saved.map((concept) => concept.id)].map((id) => {
                const at = id ? saved.findIndex((concept) => concept.id === id) : -1;
                return (
                  <button
                    key={id ?? 'all'}
                    type="button"
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium',
                      filter === id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {id ? t('images.ideaLabel', { index: at + 1 }) : t('images.filterAll', { count: saved.length })}
                  </button>
                );
              })}
            </div>
          ) : null}
          {focused ? null : writeIdeasButton}
        </div>
      </header>
      {serverChanged ? <ServerChangedNotice onReload={reload} /> : null}
      {!imagesAvailable ? <p className="text-xs text-warning">{t('images.notConfigured')}</p> : null}

      {!ideasOnly && !focused && slots.length ? (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="ad-studio-image-summary">
          {summary.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-background p-3 shadow-soft" data-testid={`ad-studio-image-summary-${item.key}`}>
              <div className="flex min-w-0 flex-col">
                <dt className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">{item.label}</dt>
                <dd className="whitespace-nowrap font-pp-display text-lg font-semibold tabular-nums sm:text-xl">{item.value}</dd>
              </div>
              <span className={cn('hidden h-9 w-9 shrink-0 items-center justify-center rounded-full sm:flex', item.tone)}>
                <item.icon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
          ))}
        </dl>
      ) : null}

      {draft.length === 0 ? <p className="text-sm text-muted-foreground">{t('images.noIdeas')}</p> : null}
      {/* Review compares the ideas side by side; editing them in Plan stays one column. */}
      {focused && !draft.some((concept) => concept.id === focusConceptId) ? (
        <p className="text-sm text-muted-foreground" data-testid="ad-studio-idea-missing">{t('images.ideaMissing')}</p>
      ) : null}
      {/* One idea's page gives it the full width; the list compares ideas side by side. */}
      <ol className={cn('grid grid-cols-1 items-start gap-4', !ideasOnly && !focused && 'md:grid-cols-2 2xl:grid-cols-3')}>
        {draft.map((concept, index) => {
          const savedConcept = saved.find((entry) => entry.id === concept.id);
          const conceptSlots = slots.filter((slot) => slot.conceptId === concept.id);
          const conceptIssues = issues.filter((issue) => issue.concept === index + 1);
          return (
            <li
              key={concept.id}
              className={cn('flex min-w-0 flex-col gap-3 rounded-3xl border border-border/60 bg-background p-4 shadow-soft', filter && filter !== concept.id && 'hidden')}
              data-testid={`ad-studio-image-concept-${index + 1}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-pp-display text-lg font-semibold">{t('images.ideaLabel', { index: index + 1 })}</span>
                  {concept.headline.trim() ? (
                    <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" dir="auto">
                      {concept.headline}
                    </span>
                  ) : null}
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  {savedConcept ? (
                    <button
                      type="button"
                      onClick={() => setIdeaRewrite(ideaRewrite?.id === concept.id ? null : { id: concept.id, instruction: '' })}
                      disabled={!textAvailable || pending !== null}
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-primary/10 px-3 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
                      aria-expanded={ideaRewrite?.id === concept.id}
                    >
                      <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('images.rewriteIdea')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}
                    title={t('images.removeIdea')}
                    className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className={cn(!ideasOnly && 'sr-only')}>{t('images.removeIdea')}</span>
                  </button>
                </span>
              </div>
              {ideaRewrite?.id === concept.id ? (
                <form
                  className="flex flex-col gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-3"
                  data-testid="ad-studio-idea-rewrite"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void call(`rewrite-${concept.id}`, '/image-concepts/generate', json('POST', { conceptId: concept.id, instruction: ideaRewrite.instruction }), () => setIdeaRewrite(null));
                  }}
                >
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    {t('images.rewriteIdeaInstruction')}
                    <input
                      autoFocus
                      value={ideaRewrite.instruction}
                      onChange={(event) => setIdeaRewrite({ id: concept.id, instruction: event.target.value })}
                      maxLength={500}
                      dir="auto"
                      placeholder={t('images.rewriteIdeaPlaceholder')}
                      className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                    />
                  </label>
                  {dirty ? <p className="text-xs text-warning">{t('images.saveEditsFirst')}</p> : null}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={dirty || pending !== null || ideaRewrite.instruction.trim().length === 0}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {pending === `rewrite-${concept.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                      {t('images.rewriteIdeaRun')}
                    </button>
                    <button type="button" onClick={() => setIdeaRewrite(null)} className="rounded-full border border-border px-3 py-1.5 text-xs">
                      {t('cancel')}
                    </button>
                  </div>
                </form>
              ) : null}
              {ideasOnly ? null : (
                <div className="flex flex-wrap gap-1.5" data-testid="ad-studio-idea-placements">
                  {concept.formats.map((format) => (
                    <span key={format} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                      {t(`images.format.${format}`)}
                    </span>
                  ))}
                </div>
              )}
              {/* In Review the idea's fields fold away behind one line; in Plan they are the point and stay open. */}
              <details open={ideasOnly} className="rounded-lg" data-testid="ad-studio-idea-fields">
                <summary className={cn('cursor-pointer text-xs font-medium text-primary', ideasOnly && 'sr-only')}>{t('images.editIdea')}</summary>
                <div className={cn('mt-2 grid gap-3', ideasOnly && 'md:grid-cols-2')}>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    {t('images.visualPrompt')}
                    <textarea
                      value={concept.visualPrompt}
                      onChange={(event) => update(index, { visualPrompt: event.target.value })}
                      rows={3}
                      dir="auto"
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
                          {t(`images.format.${format}`)} <span className="font-normal tabular-nums">{AD_STUDIO_IMAGE_ASPECT_RATIO[format]}</span>
                        </button>
                      ))}
                    </fieldset>
                  </div>
                </div>
              </details>
              {conceptIssues.length ? <p className="text-xs text-destructive">{conceptIssues.map((issue) => t(`images.issue.${issue.code}`)).join(' · ')}</p> : null}
              {savedConcept ? (
                <div className="w-full">
                  <AdCopyCard
                    orgId={orgId}
                    projectId={projectId}
                    briefId={briefId}
                    copyKey={savedConcept.id}
                    copy={savedConcept.copy ?? null}
                    advertiser={advertiser ?? briefName}
                    aiAvailable={textAvailable}
                    onSaved={(copy) => {
                      const apply = (list: AdStudioImageConcept[]) =>
                        list.map((entry) => (entry.id === savedConcept.id ? { ...entry, ...(copy ? { copy } : { copy: undefined }) } : entry));
                      setSaved(apply);
                      setDraft(apply);
                    }}
                    linkUrl={linkUrl}
                    preview={(() => {
                      // Every placement shows its own image with the copy: the feed, the story, Google display.
                      const byFormat = Object.fromEntries(
                        conceptSlots.flatMap((slot) => (slot.selected?.status === 'ready' ? [[slot.format, `${base}/images/${slot.selected.id}/media`]] : [])),
                      );
                      return ideasOnly || Object.keys(byFormat).length === 0
                        ? undefined
                        : { kind: 'image' as const, byFormat, alt: t('images.ideaLabel', { index: index + 1 }) };
                    })()}
                  />
                </div>
              ) : null}

              {ideasOnly ? null : savedConcept ? (
                // The images stay in view: each placement is a compact card, so nothing waits behind a fold.
                <div className="flex flex-col gap-2" data-testid="ad-studio-image-manage">
                  <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
                    <Images className="h-4 w-4 text-primary" aria-hidden="true" />
                    {t('images.imagesHeading', { count: conceptSlots.length })}
                  </h3>
                  <div className={cn('grid grid-cols-1 gap-2', focused && 'gap-3 sm:grid-cols-2 xl:grid-cols-4')}>{conceptSlots.map((slot) => renderSlot(slot, index))}</div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('images.saveToRender')}</p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-background p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {dirty ? <span className="text-warning">{t('images.unsaved')}</span> : null}
          {!canExport && !ideasOnly ? <span className="text-muted-foreground">{t('exportNeedsPermission')}</span> : null}
          {message ? (
            <span role="status" className={message.tone === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
              {message.text}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {focused ? null : (
          <button
            type="button"
            onClick={() => setDraft((current) => [...current, newConcept()])}
            disabled={draft.length >= AD_STUDIO_MAX_IMAGE_CONCEPTS}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-medium hover:bg-muted/70 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('images.addIdea')}
          </button>
          )}
          <button
            type="button"
            onClick={() => void call('save', '/image-concepts', json('PUT', { concepts: draft }), () => setMessage({ tone: 'ok', text: t('images.ideasSaved') }))}
            disabled={pending !== null || !dirty || issues.length > 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 disabled:opacity-50 disabled:shadow-none"
          >
            {pending === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {t('images.saveIdeas')}
          </button>
        </div>
      </div>
    </section>
  );
}
