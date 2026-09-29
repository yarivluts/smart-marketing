'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, CircleDashed, CircleSlash, Loader2, Rocket, Square, XCircle } from 'lucide-react';
import { AD_STUDIO_IMAGE_FORMATS, type AdStudioImageFormat } from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { AdStudioRunView } from '@/lib/ad-studio/view';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface AutopilotPanelProps {
  orgId: string;
  projectId: string;
  briefId: string;
  initialRun: AdStudioRunView | null;
  /** What the brief already has - the autopilot keeps it and says so. */
  has: { plan: boolean; script: boolean; concepts: boolean };
  /** Which models the deployment has; a missing one is explained, not hidden. */
  available: { text: boolean; images: boolean; video: boolean };
  /** Where the stepper goes once the plan is confirmed (Create) and once everything is made (Review). */
  stepHrefs?: { create: string; review: string };
  /** `prepare`: the Plan step (start, then confirm); `progress`: the Create step (watch it render). */
  mode?: 'prepare' | 'progress';
}

/** Pause between advance calls; each call itself does real work (an image, a plan), so this only spaces them. */
const ADVANCE_GAP_MS = 1500;

const KNOWN_REASONS = new Set([
  'off',
  'already_done',
  'no_concepts',
  'no_script',
  'not_configured',
  'quota_exceeded',
  'provider_billing',
  'rate_limited',
  'refused',
  'invalid_output',
  'provider_error',
  'some_images_failed',
  'clip_failed',
  'clips_not_ready',
  'blocked',
  'cancelled',
  'error',
]);

const STEP_ICON = {
  pending: CircleDashed,
  running: Loader2,
  done: CheckCircle2,
  skipped: CircleSlash,
  failed: XCircle,
} as const;

const STEP_TONE = {
  pending: 'text-muted-foreground',
  running: 'text-primary',
  done: 'text-success',
  skipped: 'text-muted-foreground',
  failed: 'text-destructive',
} as const;

/**
 * The autopilot of one ad: one button that takes the brief all the way to finished creatives - deep
 * plan, script, image ideas, images in each placement, video clips and the assembled video - while
 * keeping everything the person already made or edited. It drives the run from the browser, one
 * unit of work per call, and refreshes the rest of the page as steps finish, so every result is
 * editable below as soon as it exists. Exporting stays a separate, deliberate act.
 */
export function AutopilotPanel({ orgId, projectId, briefId, initialRun, has, available, stepHrefs, mode = 'prepare' }: AutopilotPanelProps): React.ReactElement {
  const t = useTranslations('AdStudio');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const [run, setRun] = React.useState<AdStudioRunView | null>(initialRun);
  const [plan, setPlan] = React.useState(true);
  const [images, setImages] = React.useState(true);
  const [video, setVideo] = React.useState(true);
  const [formats, setFormats] = React.useState<AdStudioImageFormat[]>(['square', 'portrait']);
  const [pending, setPending] = React.useState<'start' | 'cancel' | 'approve' | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${briefId}/autopilot`;
  const running = run?.status === 'running';
  const awaiting = run?.status === 'awaiting_approval';
  const stepHrefsRef = React.useRef(stepHrefs);
  stepHrefsRef.current = stepHrefs;

  React.useEffect(() => setRun(initialRun), [initialRun]);
  // The loop below must not restart on every render, so it reads these through refs.
  const errorMessageRef = React.useRef(errorMessage);
  errorMessageRef.current = errorMessage;
  const routerRef = React.useRef(router);
  routerRef.current = router;

  // Drive a running run: advance, apply, pause, repeat. A step that finishes refreshes the page's
  // server parts (script editor, image studio, video) so its result is there to edit right away.
  const runId = running ? run?.id : null;
  React.useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSignature = '';
    const tick = async () => {
      try {
        const response = await fetch(`${base}/${runId}/advance`, { method: 'POST', cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as { run?: AdStudioRunView } & AdStudioApiError;
        if (stopped) return;
        if (!response.ok || !body.run) {
          setMessage(errorMessageRef.current(body));
        } else {
          setRun(body.run);
          const signature = body.run.steps.map((step) => `${step.status}:${step.progress?.done ?? ''}`).join('|');
          if (signature !== lastSignature) {
            lastSignature = signature;
            routerRef.current.refresh();
          }
          if (body.run.status === 'awaiting_approval') {
            // The plan, script and ideas are ready: show them (refreshed above) and wait for the person.
            routerRef.current.refresh();
            return;
          }
          if (body.run.status === 'done' && stepHrefsRef.current) {
            routerRef.current.push(stepHrefsRef.current.review);
            return;
          }
          if (body.run.status !== 'running') return;
        }
      } catch {
        // A dropped request: the next tick tries again.
      }
      if (!stopped) timer = setTimeout(() => void tick(), ADVANCE_GAP_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [base, runId]);

  async function start(): Promise<void> {
    setPending('start');
    setMessage(null);
    try {
      const response = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: { plan, images, video, imageFormats: formats } }),
      });
      const body = (await response.json().catch(() => ({}))) as { run?: AdStudioRunView } & AdStudioApiError;
      if (!response.ok || !body.run) setMessage(errorMessage(body));
      else setRun(body.run);
    } finally {
      setPending(null);
    }
  }

  async function approve(): Promise<void> {
    if (!run) return;
    setPending('approve');
    setMessage(null);
    try {
      const response = await fetch(`${base}/${run.id}/approve`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as { run?: AdStudioRunView } & AdStudioApiError;
      if (!response.ok || !body.run) {
        setMessage(errorMessage(body));
        return;
      }
      setRun(body.run);
      if (stepHrefs) router.push(stepHrefs.create);
    } finally {
      setPending(null);
    }
  }

  async function cancel(): Promise<void> {
    if (!run) return;
    setPending('cancel');
    try {
      const response = await fetch(`${base}/${run.id}/cancel`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as { run?: AdStudioRunView };
      if (body.run) setRun(body.run);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  function toggleFormat(format: AdStudioImageFormat): void {
    setFormats((current) => (current.includes(format) ? current.filter((entry) => entry !== format) : [...current, format]));
  }

  const nothingChosen = !images && !video;
  const noFormats = images && formats.length === 0;
  const keeps = [has.plan && plan ? t('autopilot.keepsPlan') : null, has.script && video ? t('autopilot.keepsScript') : null, has.concepts && images ? t('autopilot.keepsConcepts') : null].filter(
    (entry): entry is string => entry !== null,
  );

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-sm" aria-labelledby="ad-studio-autopilot-heading" data-testid="ad-studio-autopilot">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Rocket className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <h2 id="ad-studio-autopilot-heading" className="text-lg font-semibold">
            {mode === 'prepare' ? t('autopilot.prepareTitle') : t('autopilot.createTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{mode === 'prepare' ? t('autopilot.prepareDescription') : t('autopilot.createDescription')}</p>
        </div>
      </header>

      {awaiting ? (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4" data-testid="ad-studio-confirm-plan">
          <p className="text-sm font-semibold">{t('autopilot.awaitingTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('autopilot.awaitingDescription')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void approve()}
              disabled={pending !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {pending === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              {t('autopilot.confirmPlan')}
            </button>
            <button type="button" onClick={() => void cancel()} disabled={pending !== null} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50">
              {t('autopilot.discardPlan')}
            </button>
          </div>
        </div>
      ) : null}

      {!running && !awaiting && mode === 'prepare' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={plan} onChange={(event) => setPlan(event.target.checked)} />
              {t('autopilot.optionPlan')}
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={images} onChange={(event) => setImages(event.target.checked)} />
              {t('autopilot.optionImages')}
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={video} onChange={(event) => setVideo(event.target.checked)} />
              {t('autopilot.optionVideo')}
            </label>
          </div>
          {images ? (
            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">{t('autopilot.formatsLegend')}</legend>
              {AD_STUDIO_IMAGE_FORMATS.map((format) => (
                <button
                  key={format}
                  type="button"
                  aria-pressed={formats.includes(format)}
                  onClick={() => toggleFormat(format)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    formats.includes(format) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t(`images.format.${format}`)}
                </button>
              ))}
            </fieldset>
          ) : null}
          {keeps.length ? <p className="text-xs text-muted-foreground">{t('autopilot.keeps', { items: keeps.join(', ') })}</p> : null}
          {!available.text || (images && !available.images) || (video && !available.video) ? (
            <p className="text-xs text-warning" role="note">
              {t('autopilot.missingModels')}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void start()}
              disabled={pending !== null || nothingChosen || noFormats}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {pending === 'start' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Rocket className="h-4 w-4" aria-hidden="true" />}
              {run ? t('autopilot.runAgain') : t('autopilot.prepare')}
            </button>
            {run ? <span className="text-xs text-muted-foreground">{t('autopilot.runAgainHint')}</span> : null}
          </div>
        </div>
      ) : null}

      {run ? (
        <div className="flex flex-col gap-2" data-testid="ad-studio-autopilot-run">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={cn('text-sm font-semibold', run.status === 'failed' ? 'text-destructive' : run.status === 'done' ? 'text-success' : 'text-foreground')} role="status">
              {t(`autopilot.runStatus.${run.status}`)}
            </p>
            {running ? (
              <button
                type="button"
                onClick={() => void cancel()}
                disabled={pending !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                <Square className="h-3 w-3" aria-hidden="true" />
                {t('autopilot.cancel')}
              </button>
            ) : null}
          </div>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {run.steps.map((step) => {
              const Icon = STEP_ICON[step.status];
              return (
                <li key={step.id} className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2" data-testid={`ad-studio-autopilot-step-${step.id}`}>
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', STEP_TONE[step.status], step.status === 'running' && 'animate-spin')} aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium">{t(`autopilot.step.${step.id}`)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t(`autopilot.stepStatus.${step.status}`)}
                      {step.progress && step.progress.total > 0 ? ` · ${t('autopilot.progress', { done: step.progress.done, total: step.progress.total })}` : ''}
                      {step.reason && KNOWN_REASONS.has(step.reason) ? ` · ${t(`autopilot.reason.${step.reason}`)}` : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {run.status === 'done' ? <p className="text-xs text-muted-foreground">{t('autopilot.doneHint')}</p> : null}
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </section>
  );
}
