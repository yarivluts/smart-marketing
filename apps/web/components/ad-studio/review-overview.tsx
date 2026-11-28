'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  Clapperboard,
  Globe,
  ImageIcon,
  Images,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  reviewHasWorkInProgress,
  reviewNextStep,
  videoNeedsAssembly,
  type CreativeState,
  type ImageCreativeSummary,
  type ReviewItem,
  type ReviewNextStep,
  type SearchCreativeSummary,
  type VideoCreativeSummary,
} from '@/lib/ad-studio/review-overview';
import type { AdStudioRunView } from '@/lib/ad-studio/view';
import { toast } from '@/components/ui/use-toast';
import { deviceFlags, fetchPushConfig, isPushSupported, notificationPermission, subscribeThisDevice } from '@/lib/push/client';
import { withFirstFrame } from './media-src';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

const STATE_TONE: Record<CreativeState, string> = {
  ready: 'bg-success/10 text-success',
  attention: 'bg-warning/15 text-warning',
  working: 'bg-primary/10 text-primary',
  empty: 'bg-muted text-muted-foreground',
};

const STATE_DOT: Record<CreativeState, string> = {
  ready: 'bg-success',
  attention: 'bg-warning',
  working: 'bg-primary',
  empty: 'bg-muted-foreground/40',
};

/** How often the overview checks on work in progress outside card runs. */
export const REVIEW_POLL_MS = 8000;

const ADVANCE_GAP_MS = 1500;
const MAX_BACKOFF_MS = 30_000;
const MAX_FAILURES = 6;
const MAX_AI_INSTRUCTION_CHARS = 600;

function retryDelay(failures: number): number {
  return failures === 0 ? ADVANCE_GAP_MS : Math.min(ADVANCE_GAP_MS * 2 ** failures, MAX_BACKOFF_MS);
}

const KNOWN_REASONS = new Set([
  'qa_issues',
  'no_site_url',
  'site_unreachable',
  'site_empty_page',
  'site_blocked_url',
  'site_timeout',
  'site_too_large',
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

const PREVIEW_ASPECT = { square: 'aspect-square', portrait: 'aspect-[4/5]', story: 'aspect-[9/16]', landscape: 'aspect-video' } as const;

type CardTarget = 'video' | 'search' | 'images' | 'image';

function cardKeyForRun(run: AdStudioRunView): string | null {
  const target = run.options.target;
  if (!target || target === 'all') return null;
  if (target === 'image' && run.options.targetConceptId) return `image:${run.options.targetConceptId}`;
  return target;
}

function computeRunPercent(run: AdStudioRunView): number {
  const total = run.steps.length;
  if (total === 0) return 0;
  const sum = run.steps.reduce((acc, step) => {
    if (step.status === 'done' || step.status === 'skipped') return acc + 1;
    if (step.status === 'running' && step.progress && step.progress.total > 0) {
      return acc + Math.min(1, step.progress.done / step.progress.total);
    }
    return acc;
  }, 0);
  return Math.round((sum / total) * 100);
}

function activeRunStep(run: AdStudioRunView): AdStudioRunView['steps'][number] | null {
  return run.steps.find((step) => step.status === 'running') ?? run.steps.find((step) => step.status === 'pending') ?? run.steps[run.steps.length - 1] ?? null;
}

function StateBadge({ state }: { state: CreativeState }): React.ReactElement {
  const t = useTranslations('AdStudio.review');
  const Icon = state === 'ready' ? CheckCircle2 : state === 'attention' ? AlertTriangle : state === 'working' ? Loader2 : CircleDashed;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATE_TONE[state])} data-testid="ad-studio-creative-state">
      <Icon className={cn('h-3.5 w-3.5', state === 'working' && 'animate-spin')} aria-hidden="true" />
      {t(`state.${state}`)}
    </span>
  );
}

/** A fact line under a card's preview, marked done or not. */
function Fact({ done, children, strong }: { done?: boolean; strong?: boolean; children: React.ReactNode }): React.ReactElement {
  return (
    <span className={cn('flex items-center gap-1.5', strong && 'font-semibold text-foreground')}>
      {done === undefined ? null : done ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
      )}
      {children}
    </span>
  );
}

/**
 * One creative as a card: its name and where it stands on top, the preview shown whole on a soft
 * backdrop, the few facts that matter, live progress & inline AI actions, and "Open and edit" to
 * enter the dedicated editor.
 */
function CreativeCard({
  href,
  title,
  subtitle,
  state,
  preview,
  facts,
  progress,
  controls,
  testId,
  highlight,
  span,
  fluidPreview,
}: {
  href: string;
  title: string;
  subtitle?: string;
  state: CreativeState;
  preview: React.ReactNode;
  facts: React.ReactNode;
  progress?: React.ReactNode;
  controls?: React.ReactNode;
  testId: string;
  /** The card the next-step banner points at. */
  highlight?: 'attention' | 'action';
  /** Grid span classes: the last card stretches over the rest of its row. */
  span?: string;
  /** The preview grows with the card instead of keeping a 4:3 box (a text preview on a wide card). */
  fluidPreview?: boolean;
}): React.ReactElement {
  const t = useTranslations('AdStudio.review');
  return (
    <li className={cn('min-w-0', span)}>
      <article
        className={cn(
          'flex h-full flex-col gap-3 rounded-3xl border bg-card p-4 shadow-soft transition hover:border-primary/40 hover:shadow-soft-lg',
          highlight === 'action' ? 'border-primary/50 ring-2 ring-primary/20' : highlight === 'attention' ? 'border-warning/60 ring-2 ring-warning/20' : 'border-border/60',
        )}
        data-testid={testId}
        data-highlight={highlight}
      >
        <Link href={href} className="group flex flex-col gap-3 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', STATE_DOT[state])} aria-hidden="true" />
              <div className="flex min-w-0 flex-col">
                <span className="font-pp-display text-base font-semibold leading-tight group-hover:text-primary">{title}</span>
                {subtitle ? (
                  <span className="truncate text-xs text-muted-foreground" dir="auto">
                    {subtitle}
                  </span>
                ) : null}
              </div>
            </div>
            <StateBadge state={state} />
          </div>
          <div className={cn('relative flex items-center justify-center overflow-hidden rounded-2xl bg-muted/70', fluidPreview ? 'min-h-40 flex-1' : 'aspect-[4/3]')}>{preview}</div>
        </Link>
        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">{facts}</div>
        {progress}
        {controls}
        <Link
          href={href}
          className="group mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-xs font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          data-testid={`${testId}-open`}
        >
          {t('open')}
          <ChevronLeft className="h-4 w-4 transition group-hover:-translate-x-0.5 ltr:rotate-180 ltr:group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </article>
    </li>
  );
}

/** The search card comes after the image cards and the video: it takes the rest of its row. */
function searchSpan(cardsBefore: number): string {
  const sm = cardsBefore % 2 === 0 ? 'sm:col-span-2' : '';
  const xl = ['xl:col-span-3', 'xl:col-span-2', 'xl:col-span-1'][cardsBefore % 3];
  return cn(sm, xl);
}

function EmptyPreview({ icon: Icon }: { icon: typeof ImageIcon }): React.ReactElement {
  return <Icon className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />;
}

/** The banner at the top of the overview: the one thing to do next, with the way to do it. */
function NextStepBanner({
  next,
  hrefFor,
  imagesHref,
  videoHref,
  publishHref,
}: {
  next: ReviewNextStep;
  hrefFor: (item: ReviewItem) => string;
  imagesHref: string;
  videoHref: string;
  publishHref: string | null;
}): React.ReactElement {
  const t = useTranslations('AdStudio.review.next');
  const action =
    next.kind === 'attention'
      ? { href: hrefFor(next.item), label: t('attention.action'), icon: AlertTriangle }
      : next.kind === 'assemble'
        ? { href: videoHref, label: t('assemble.action'), icon: Play }
        : next.kind === 'publish' && publishHref
          ? { href: publishHref, label: t('publish.action'), icon: Sparkles }
          : next.kind === 'start'
            ? { href: imagesHref, label: t('start.action'), icon: Wand2 }
            : null;
  const values: Record<string, number> = next.kind === 'attention' || next.kind === 'working' ? { count: next.count } : next.kind === 'publish' ? { count: next.ready } : {};
  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pp-primary to-pp-primary-container p-6 text-white shadow-glow sm:p-8"
      aria-labelledby="ad-studio-next-step-title"
      data-testid="ad-studio-review-next"
      data-next={next.kind}
    >
      <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('eyebrow')}
          </span>
          <h2 id="ad-studio-next-step-title" className="font-pp-display text-2xl font-bold leading-tight tracking-tight [text-wrap:balance] sm:text-3xl">
            {t(`${next.kind}.title`, values)}
          </h2>
          <p className="max-w-2xl text-sm text-white/85">{t(`${next.kind}.description`, values)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {action ? (
            <Link
              href={action.href}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-pp-primary shadow-sm transition hover:bg-white/90"
              data-testid="ad-studio-review-next-action"
            >
              <action.icon className="h-4 w-4" aria-hidden="true" />
              {action.label}
            </Link>
          ) : null}
          {publishHref && next.kind !== 'publish' ? (
            <Link href={publishHref} className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white/90 hover:text-white hover:underline" data-testid="ad-studio-review-next-publish">
              {t('continuePublish')}
              <ChevronLeft className="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export interface ReviewOverviewProps {
  mediaBase: string;
  /** Where each card and action leads: the image idea's detail by concept id, all ideas, the video, the search ad. */
  hrefs: { image: Record<string, string>; images: string; video: string; search: string };
  images: ImageCreativeSummary[];
  video: VideoCreativeSummary;
  search: SearchCreativeSummary;
  videoFormat: 'vertical' | 'horizontal';
  /** The ad's writing direction: the search ad preview reads like the ad, not like the page. */
  adDirection?: 'rtl' | 'ltr';
  /** The Publish step, once something can be published; null while it is locked. */
  publishHref?: string | null;
  /** Opens pre-publication client sharing for this ad before publish. */
  shareHref?: string | null;
  /** The landing page's host, shown in the search ad preview the way Google shows it. */
  searchHost?: string | null;
  /** Active or recently failed card-scoped runs for this brief. */
  initialRuns?: AdStudioRunView[];
  /** Whether the brief/project already has a target website URL for AI enrichment. */
  hasSiteUrl?: boolean;
  /** Which AI providers are configured on this deployment. */
  available?: { text: boolean; images: boolean; video: boolean };
}

const EMPTY_RUNS: AdStudioRunView[] = [];
const DEFAULT_AVAILABLE = { text: true, images: true, video: true };

function runStepSignature(run: AdStudioRunView): string {
  return run.steps
    .map((step) => `${step.id}:${step.status}:${step.progress?.done ?? ''}:${step.progress?.total ?? ''}:${step.reason ?? ''}`)
    .join('|');
}

function runProgressUnits(run: AdStudioRunView): number {
  return run.steps.reduce((acc, step) => {
    if (step.status === 'done' || step.status === 'skipped' || step.status === 'failed') return acc + 1000;
    if (step.status === 'running') {
      const done = step.progress?.done ?? 0;
      return acc + 100 + done;
    }
    return acc;
  }, 0);
}

/**
 * The Review step's first screen: what to do next, then every ad as a card - each image idea, the
 * video, the search ad - with one-click creation, live progress, inline AI revisions, push
 * completion notifications, and "Open and edit" into each dedicated editor.
 */
export function ReviewOverview({
  mediaBase,
  hrefs,
  images,
  video,
  search,
  videoFormat,
  adDirection = 'ltr',
  publishHref = null,
  shareHref = null,
  searchHost = null,
  initialRuns = EMPTY_RUNS,
  hasSiteUrl = true,
  available = DEFAULT_AVAILABLE,
}: ReviewOverviewProps): React.ReactElement {
  const t = useTranslations('AdStudio.review');
  const ta = useTranslations('AdStudio.autopilot');
  const ts = useTranslations('AdStudio');
  const tf = useTranslations('AdStudio.images.format');
  const locale = useLocale();
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();

  const [runsByKey, setRunsByKey] = React.useState<Record<string, AdStudioRunView>>(() => {
    const map: Record<string, AdStudioRunView> = {};
    for (const run of initialRuns) {
      const key = cardKeyForRun(run);
      if (key && !map[key]) map[key] = run;
    }
    return map;
  });
  const [pausedKeys, setPausedKeys] = React.useState<Record<string, boolean>>({});
  const [startingKey, setStartingKey] = React.useState<string | null>(null);
  const [cancellingKey, setCancellingKey] = React.useState<string | null>(null);
  const [cardErrors, setCardErrors] = React.useState<Record<string, string>>({});
  const [openAiKey, setOpenAiKey] = React.useState<string | null>(null);
  const [aiInputs, setAiInputs] = React.useState<Record<string, string>>({});
  const [siteUrl, setSiteUrl] = React.useState('');

  const [pushPrompt, setPushPrompt] = React.useState<{ publicKey: string } | null>(null);
  const [pushEnabling, setPushEnabling] = React.useState(false);
  const [pushEnabledHere, setPushEnabledHere] = React.useState(false);

  React.useEffect(() => {
    setRunsByKey((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const run of initialRuns) {
        const key = cardKeyForRun(run);
        if (!key) continue;
        const current = next[key];
        if (!current) {
          next[key] = run;
          changed = true;
          continue;
        }
        if (current.id !== run.id) {
          if (run.startedOn > current.startedOn) {
            next[key] = run;
            changed = true;
          }
          continue;
        }
        // Same run ID: never regress a terminal state from a stale refresh snapshot.
        if (current.status !== 'running') continue;
        if (
          run.status !== 'running' ||
          (runStepSignature(run) !== runStepSignature(current) && runProgressUnits(run) >= runProgressUnits(current))
        ) {
          next[key] = run;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initialRuns]);

  React.useEffect(() => {
    if (!isPushSupported() || deviceFlags.isOff() || notificationPermission() !== 'default') return;
    let cancelled = false;
    void fetchPushConfig().then((config) => {
      if (!cancelled && config.configured && config.publicKey) {
        setPushPrompt({ publicKey: config.publicKey });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const runsRef = React.useRef(runsByKey);
  runsRef.current = runsByKey;
  const pausedRef = React.useRef(pausedKeys);
  pausedRef.current = pausedKeys;
  const routerRef = React.useRef(router);
  routerRef.current = router;
  const errorMessageRef = React.useRef(errorMessage);
  errorMessageRef.current = errorMessage;
  const hrefsRef = React.useRef(hrefs);
  hrefsRef.current = hrefs;
  const tRef = React.useRef(t);
  tRef.current = t;
  const taRef = React.useRef(ta);
  taRef.current = ta;

  const activeRunSignature = Object.entries(runsByKey)
    .filter(([key, run]) => run.status === 'running' && !pausedKeys[key])
    .map(([key, run]) => `${key}:${run.id}`)
    .sort()
    .join('|');

  React.useEffect(() => {
    if (!activeRunSignature) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cursor = 0;
    const failuresByRun = new Map<string, number>();
    const lastStepSigByRun = new Map<string, string>();

    const hrefForKey = (key: string): string => {
      if (key === 'video') return hrefsRef.current.video;
      if (key === 'search') return hrefsRef.current.search;
      if (key.startsWith('image:')) {
        const conceptId = key.slice('image:'.length);
        return hrefsRef.current.image[conceptId] ?? hrefsRef.current.images;
      }
      return hrefsRef.current.images;
    };

    const doneTitleForKey = (key: string): string => {
      if (key === 'video') return tRef.current('quick.toastDoneVideo');
      if (key === 'search') return tRef.current('quick.toastDoneSearch');
      return tRef.current('quick.toastDoneImages');
    };

    const tick = async () => {
      const running = Object.entries(runsRef.current).filter(([key, run]) => run.status === 'running' && !pausedRef.current[key]);
      if (running.length === 0) return;
      const [key, run] = running[cursor % running.length];
      cursor += 1;

      let failures = failuresByRun.get(run.id) ?? 0;
      let pausedThisTick = false;
      let updatedRun: AdStudioRunView | null = null;
      try {
        const response = await fetch(`${mediaBase}/autopilot/${run.id}/advance`, { method: 'POST', cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as { run?: AdStudioRunView } & AdStudioApiError;
        if (stopped) return;
        if (!response.ok || !body.run) {
          const msg = errorMessageRef.current(body);
          setCardErrors((prev) => ({ ...prev, [key]: msg }));
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            pausedThisTick = true;
            setPausedKeys((prev) => ({ ...prev, [key]: true }));
          } else {
            failures += 1;
            failuresByRun.set(run.id, failures);
          }
        } else {
          failures = 0;
          failuresByRun.set(run.id, 0);
          updatedRun = body.run;
          setCardErrors((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
          setRunsByKey((prev) => ({ ...prev, [key]: body.run as AdStudioRunView }));

          const sig = body.run.steps.map((step) => `${step.status}:${step.progress?.done ?? ''}`).join('|');
          if (sig !== lastStepSigByRun.get(run.id)) {
            lastStepSigByRun.set(run.id, sig);
            routerRef.current.refresh();
          }

          if (body.run.status === 'done') {
            routerRef.current.refresh();
            const targetHref = hrefForKey(key);
            toast({
              variant: 'success',
              title: doneTitleForKey(key),
              description: tRef.current('quick.toastDoneBody'),
              action: {
                label: tRef.current('open'),
                onClick: () => routerRef.current.push(targetHref),
              },
            });
          } else if (body.run.status === 'failed') {
            routerRef.current.refresh();
            const reasonCode = body.run.failureCode;
            const reasonText =
              reasonCode && KNOWN_REASONS.has(reasonCode)
                ? taRef.current(`reason.${reasonCode}` as never)
                : taRef.current('runStatus.failed');
            toast({
              variant: 'destructive',
              title: tRef.current('quick.toastFailedTitle'),
              description: reasonText,
            });
          }
        }
      } catch {
        failures += 1;
        failuresByRun.set(run.id, failures);
      }

      if (stopped) return;
      if (failures >= MAX_FAILURES) {
        pausedThisTick = true;
        setPausedKeys((prev) => ({ ...prev, [key]: true }));
      }

      const stillRunning = Object.entries(runsRef.current).filter(([k, r]) => {
        if (k === key) {
          if (pausedThisTick) return false;
          const nextStatus = updatedRun ? updatedRun.status : r.status;
          return nextStatus === 'running';
        }
        return r.status === 'running' && !pausedRef.current[k];
      });
      if (stillRunning.length === 0) return;
      const delay = !pausedThisTick && failures > 0 ? retryDelay(failures) : stillRunning.length > 1 ? 450 : ADVANCE_GAP_MS;
      timer = setTimeout(() => void tick(), delay);
    };

    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeRunSignature, mediaBase]);

  const inProgress = reviewHasWorkInProgress(images, video);
  const videoGenerating = video.generating;
  // Keep refreshing for work started elsewhere (e.g. an open editor tab or full autopilot) when no card run is advancing here.
  React.useEffect(() => {
    if (!inProgress || Boolean(activeRunSignature)) return;
    const poll = setInterval(() => {
      void (async () => {
        if (videoGenerating) {
          try {
            await fetch(`${mediaBase}/render-status`, { cache: 'no-store' });
          } catch {
            // The next poll tries again.
          }
        }
        router.refresh();
      })();
    }, REVIEW_POLL_MS);
    return () => clearInterval(poll);
  }, [inProgress, activeRunSignature, videoGenerating, mediaBase, router]);

  async function enablePush(): Promise<void> {
    if (!pushPrompt) return;
    setPushEnabling(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushPrompt(null);
        if (permission === 'denied') toast({ variant: 'destructive', description: t('quick.notifyBlocked') });
        return;
      }
      const subscription = await subscribeThisDevice(pushPrompt.publicKey, locale);
      if (subscription) {
        setPushEnabledHere(true);
        setPushPrompt(null);
        toast({ variant: 'success', description: t('quick.notifyEnabled') });
      }
    } finally {
      setPushEnabling(false);
    }
  }

  async function startCardCreation(cardKey: string, options: Record<string, unknown>): Promise<void> {
    setStartingKey(cardKey);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[cardKey];
      return next;
    });
    try {
      const trimmedSite = siteUrl.trim();
      const response = await fetch(`${mediaBase}/autopilot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: {
            ...options,
            siteEnrich: true,
            confirmPlan: false,
            notifyAlways: true,
            ...(trimmedSite ? { siteUrl: trimmedSite } : {}),
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { run?: AdStudioRunView } & AdStudioApiError;
      if (!response.ok || !body.run) {
        setCardErrors((prev) => ({ ...prev, [cardKey]: errorMessage(body) }));
      } else {
        setPausedKeys((prev) => ({ ...prev, [cardKey]: false }));
        setRunsByKey((prev) => ({ ...prev, [cardKey]: body.run as AdStudioRunView }));
      }
    } catch {
      setCardErrors((prev) => ({ ...prev, [cardKey]: errorMessage({}) }));
    } finally {
      setStartingKey(null);
    }
  }

  async function submitAiRevision(cardKey: string, target: CardTarget, conceptId?: string): Promise<void> {
    const instruction = (aiInputs[cardKey] ?? '').trim();
    if (!instruction) return;
    setStartingKey(cardKey);
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[cardKey];
      return next;
    });
    try {
      const trimmedSite = siteUrl.trim();
      const response = await fetch(`${mediaBase}/ai-revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target,
          ...(conceptId ? { conceptId } : {}),
          instruction,
          ...(trimmedSite ? { siteUrl: trimmedSite } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { run?: AdStudioRunView } & AdStudioApiError;
      if (!response.ok || !body.run) {
        setCardErrors((prev) => ({ ...prev, [cardKey]: errorMessage(body) }));
      } else {
        setOpenAiKey(null);
        setAiInputs((prev) => ({ ...prev, [cardKey]: '' }));
        setPausedKeys((prev) => ({ ...prev, [cardKey]: false }));
        setRunsByKey((prev) => ({ ...prev, [cardKey]: body.run as AdStudioRunView }));
      }
    } catch {
      setCardErrors((prev) => ({ ...prev, [cardKey]: errorMessage({}) }));
    } finally {
      setStartingKey(null);
    }
  }

  async function cancelCardRun(cardKey: string, runId: string): Promise<void> {
    setCancellingKey(cardKey);
    try {
      const response = await fetch(`${mediaBase}/autopilot/${runId}/cancel`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as { run?: AdStudioRunView };
      if (body.run) {
        setRunsByKey((prev) => ({ ...prev, [cardKey]: body.run as AdStudioRunView }));
      }
      router.refresh();
    } catch {
      setCardErrors((prev) => ({ ...prev, [cardKey]: errorMessage({}) }));
    } finally {
      setCancellingKey(null);
    }
  }

  function renderCardProgress(cardKey: string, onRetry: () => void): React.ReactNode {
    const run = runsByKey[cardKey];
    const errorText = cardErrors[cardKey];
    if (!run && !errorText) return null;

    if (run?.status === 'running') {
      const percent = computeRunPercent(run);
      const step = activeRunStep(run);
      const isPaused = Boolean(pausedKeys[cardKey]);
      return (
        <div
          className="flex flex-col gap-2 rounded-2xl border border-pp-primary/25 bg-pp-primary-fixed/30 p-3 text-xs"
          data-testid={`ad-studio-card-progress-${cardKey}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 font-semibold text-pp-primary">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              <span className="truncate">
                {step ? ta(`step.${step.id}`) : ta('runStatus.running')}
                {step?.progress && step.progress.total > 0 ? ` · ${ta('progress', { done: step.progress.done, total: step.progress.total })}` : ''}
              </span>
            </span>
            <span className="font-mono text-[11px] font-semibold tabular-nums text-pp-primary">
              {ts('stepWorkspace.progressPercent', { percent })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={step ? ta(`step.${step.id}`) : ta('runStatus.running')}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-pp-surface-container"
          >
            <div
              className="h-full rounded-full bg-gradient-to-l from-pp-primary to-pp-primary-fixed-dim transition-all duration-300"
              style={{ width: `${Math.max(4, percent)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            {pushEnabledHere ? (
              <span className="text-[11px] text-success">{t('quick.notifyEnabled')}</span>
            ) : pushPrompt ? (
              <button
                type="button"
                onClick={() => void enablePush()}
                disabled={pushEnabling}
                className="inline-flex items-center gap-1 rounded-full border border-pp-primary/35 bg-card px-2.5 py-1 text-[11px] font-semibold text-pp-primary hover:bg-pp-primary-fixed disabled:opacity-50"
                data-testid={`ad-studio-card-notify-${cardKey}`}
              >
                <BellRing className="h-3 w-3" aria-hidden="true" />
                {t('quick.notifyWhenDone')}
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">{t('quick.notifyBackgroundHint')}</span>
            )}
            <div className="flex items-center gap-1.5">
              {isPaused ? (
                <button
                  type="button"
                  onClick={() => setPausedKeys((prev) => ({ ...prev, [cardKey]: false }))}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground"
                >
                  {ta('resume')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void cancelCardRun(cardKey, run.id)}
                disabled={cancellingKey === cardKey}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                data-testid={`ad-studio-card-stop-${cardKey}`}
              >
                <Square className="h-2.5 w-2.5" aria-hidden="true" />
                {t('quick.stop')}
              </button>
            </div>
          </div>
          {errorText ? (
            <p role="alert" className="text-[11px] text-destructive">
              {errorText}
            </p>
          ) : null}
        </div>
      );
    }

    if (run?.status === 'failed' || errorText) {
      const reasonCode = run?.failureCode ?? null;
      const reasonText = errorText || (reasonCode && KNOWN_REASONS.has(reasonCode) ? ta(`reason.${reasonCode}` as never) : ta('runStatus.failed'));
      return (
        <div className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs" role="alert" data-testid={`ad-studio-card-error-${cardKey}`}>
          <span className="font-medium text-destructive">{reasonText}</span>
          {run?.status === 'failed' ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={startingKey === cardKey}
              className="inline-flex items-center gap-1.5 self-start rounded-full border border-destructive/40 bg-card px-3 py-1 text-[11px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {t('quick.tryAgain')}
            </button>
          ) : null}
        </div>
      );
    }

    return null;
  }

  function renderCardControls(params: {
    cardKey: string;
    target: CardTarget;
    conceptId?: string;
    state: CreativeState;
    startLabel?: string;
    startDisabled?: boolean;
    onStart?: () => void;
    aiPlaceholder: string;
    testSuffix: string;
  }): React.ReactNode {
    const isRunning = runsByKey[params.cardKey]?.status === 'running';
    if (isRunning) return null;
    const busy = startingKey === params.cardKey;
    const aiOpen = openAiKey === params.cardKey;
    const aiText = aiInputs[params.cardKey] ?? '';
    const aiDisabled =
      !available.text ||
      (params.target === 'video' && !available.video) ||
      ((params.target === 'images' || params.target === 'image') && !available.images);

    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {params.onStart && params.startLabel ? (
            <button
              type="button"
              onClick={params.onStart}
              disabled={busy || params.startDisabled}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
              data-testid={`ad-studio-card-start-${params.testSuffix}`}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
              {params.startLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpenAiKey(aiOpen ? null : params.cardKey)}
            disabled={busy || aiDisabled}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-pp-outline-variant/50 bg-pp-surface-container-low px-3.5 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
            data-testid={`ad-studio-card-ai-toggle-${params.testSuffix}`}
          >
            <Wand2 className="h-3.5 w-3.5 text-pp-primary" aria-hidden="true" />
            {params.state === 'empty' ? t('quick.aiCreateWithNote') : t('quick.aiChange')}
          </button>
        </div>

        {(Boolean(params.onStart) && Boolean(params.startDisabled)) || aiDisabled ? (
          <p className="text-[11px] text-warning" role="note">
            {t('quick.aiUnavailable')}
          </p>
        ) : null}

        {aiOpen ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitAiRevision(params.cardKey, params.target, params.conceptId);
            }}
            className="flex flex-col gap-2 rounded-2xl border border-pp-outline-variant/50 bg-pp-surface-container-low/80 p-3"
            data-testid={`ad-studio-card-ai-form-${params.testSuffix}`}
          >
            <textarea
              rows={2}
              maxLength={MAX_AI_INSTRUCTION_CHARS}
              value={aiText}
              onChange={(event) => setAiInputs((prev) => ({ ...prev, [params.cardKey]: event.target.value }))}
              placeholder={params.aiPlaceholder}
              aria-label={params.aiPlaceholder}
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              data-testid={`ad-studio-card-ai-input-${params.testSuffix}`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={busy || !aiText.trim()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                data-testid={`ad-studio-card-ai-submit-${params.testSuffix}`}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}
                {t('quick.aiSubmit')}
              </button>
              <button
                type="button"
                onClick={() => setOpenAiKey(null)}
                disabled={busy}
                className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                {t('quick.aiCancel')}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    );
  }

  const effectiveImages = images.map((image) => ({
    ...image,
    state: runsByKey[`image:${image.conceptId}`]?.status === 'running' ? ('working' as const) : image.state,
  }));
  const effectiveVideo: VideoCreativeSummary = {
    ...video,
    state: runsByKey.video?.status === 'running' ? 'working' : video.state,
  };
  const effectiveSearch: SearchCreativeSummary = {
    ...search,
    state: runsByKey.search?.status === 'running' ? 'working' : search.state,
  };

  const counts = [...effectiveImages.map((image) => image.state), effectiveVideo.state, effectiveSearch.state];
  const next = reviewNextStep(effectiveImages, effectiveVideo, effectiveSearch);
  const hrefFor = (item: ReviewItem) => (item.kind === 'image' ? hrefs.image[item.conceptId] : hrefs[item.kind]);
  const highlightOf = (item: ReviewItem): 'attention' | 'action' | undefined => {
    if (next.kind === 'assemble') return item.kind === 'video' ? 'action' : undefined;
    if (next.kind !== 'attention') return undefined;
    const target = next.item;
    return target.kind === item.kind && (target.kind !== 'image' || (item.kind === 'image' && target.conceptId === item.conceptId)) ? 'attention' : undefined;
  };

  const videoStartOptions = { plan: true, images: false, video: true, search: false, target: 'video' };
  const searchStartOptions = { plan: true, images: false, video: false, search: true, target: 'search' };
  const imagesStartOptions = { plan: true, images: true, imageFormats: ['square', 'portrait'], video: false, search: false, target: 'images' };

  const videoNeedsWork =
    effectiveVideo.state === 'empty' ||
    effectiveVideo.rendered < effectiveVideo.scenes ||
    effectiveVideo.outOfDate > 0 ||
    videoNeedsAssembly(effectiveVideo);
  const videoStartLabel =
    effectiveVideo.state === 'empty'
      ? t('quick.startCreating')
      : videoNeedsAssembly(effectiveVideo)
        ? t('next.assemble.action')
        : videoNeedsWork
          ? t('quick.recreate')
          : undefined;
  const searchStartLabel =
    effectiveSearch.state === 'empty'
      ? t('quick.startCreating')
      : effectiveSearch.state !== 'ready'
        ? t('quick.finishCreating')
        : undefined;

  return (
    <div className="flex flex-col gap-6" data-testid="ad-studio-review-overview">
      <NextStepBanner next={next} hrefFor={hrefFor} imagesHref={hrefs.images} videoHref={hrefs.video} publishHref={publishHref} />

      <section className="flex flex-col gap-4" aria-labelledby="ad-studio-review-overview-heading">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="ad-studio-review-overview-heading" className="font-pp-display text-xl font-semibold tracking-tight">
                {t('title')}
              </h2>
              <p className="flex flex-wrap gap-1.5 text-xs" data-testid="ad-studio-review-counts">
                {(['ready', 'attention', 'working'] as const).map((state) => {
                  const count = counts.filter((value) => value === state).length;
                  return count ? (
                    <span key={state} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold', STATE_TONE[state])}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', STATE_DOT[state])} aria-hidden="true" />
                      {t(`count.${state}`, { count })}
                    </span>
                  ) : null;
                })}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">{t('description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {shareHref ? (
              <Link
                href={shareHref}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-pp-outline-variant/50 bg-card px-4 text-sm font-semibold text-pp-primary hover:bg-pp-primary-fixed"
                data-testid="ad-studio-review-share"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                {t('shareBeforePublish')}
              </Link>
            ) : null}
            <Link
              href={hrefs.images}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 text-sm font-semibold text-primary hover:bg-primary/10"
              data-testid="ad-studio-review-manage-ideas"
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              {t('manageIdeas')}
            </Link>
          </div>
        </header>

        {!hasSiteUrl && available.text ? (
          <div
            className="flex flex-col gap-2 rounded-2xl border border-pp-outline-variant/45 bg-pp-surface-container-low/70 p-3.5"
            data-testid="ad-studio-review-site-url"
          >
            <label htmlFor="ad-studio-quick-site-url" className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Globe className="h-3.5 w-3.5 text-pp-primary" aria-hidden="true" />
              {t('quick.siteUrlLabel')}
            </label>
            <input
              id="ad-studio-quick-site-url"
              type="url"
              dir="ltr"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder={t('quick.siteUrlPlaceholder')}
              className="h-9 w-full rounded-xl border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
            <p className="text-[11px] text-muted-foreground">{t('quick.siteUrlHint')}</p>
          </div>
        ) : null}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {effectiveImages.map((image) => {
            const cardKey = `image:${image.conceptId}`;
            const hasUnrenderedPlacement = image.placements.some((p) => p.state === 'empty');
            const imageNeedsCreation = image.state === 'empty' || hasUnrenderedPlacement;
            const imageStartOptions = {
              plan: false,
              images: true,
              imageFormats: image.placements.length ? image.placements.map((p) => p.format) : ['square', 'portrait'],
              video: false,
              search: false,
              target: 'image',
              targetConceptId: image.conceptId,
            };
            return (
              <CreativeCard
                key={image.conceptId}
                href={hrefs.image[image.conceptId]}
                testId={`ad-studio-creative-image-${image.index}`}
                title={t('imageTitle', { index: image.index })}
                subtitle={image.headline || undefined}
                state={image.state}
                highlight={highlightOf({ kind: 'image', conceptId: image.conceptId })}
                preview={
                  image.preview ? (
                    // A plain img: private media from our own authenticated route.
                    <img src={`${mediaBase}/images/${image.preview.imageId}/media`} alt={t('imageTitle', { index: image.index })} className={cn('h-full max-w-full object-contain', PREVIEW_ASPECT[image.preview.format])} />
                  ) : (
                    <EmptyPreview icon={ImageIcon} />
                  )
                }
                facts={
                  <>
                    <span className="flex flex-wrap gap-1">
                      {image.placements.map((placement) => (
                        <span key={placement.format} className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATE_TONE[placement.state])}>
                          {tf(placement.format)}
                        </span>
                      ))}
                    </span>
                    <Fact done={image.hasCopy}>{image.hasCopy ? t('copyReady') : t('copyMissing')}</Fact>
                  </>
                }
                progress={renderCardProgress(cardKey, () => void startCardCreation(cardKey, imageStartOptions))}
                controls={renderCardControls({
                  cardKey,
                  target: 'image',
                  conceptId: image.conceptId,
                  state: image.state,
                  startLabel: image.state === 'empty' ? t('quick.startCreating') : imageNeedsCreation ? t('quick.finishCreating') : undefined,
                  startDisabled: !available.images,
                  onStart: imageNeedsCreation ? () => void startCardCreation(cardKey, imageStartOptions) : undefined,
                  aiPlaceholder: t('quick.aiPlaceholderImage'),
                  testSuffix: `image-${image.index}`,
                })}
              />
            );
          })}
          {effectiveImages.length === 0 ? (
            <CreativeCard
              href={hrefs.images}
              testId="ad-studio-creative-images-empty"
              title={t('imagesEmptyTitle')}
              state={runsByKey.images?.status === 'running' ? 'working' : 'empty'}
              preview={<EmptyPreview icon={Images} />}
              facts={<span>{t('imagesEmpty')}</span>}
              progress={renderCardProgress('images', () => void startCardCreation('images', imagesStartOptions))}
              controls={renderCardControls({
                cardKey: 'images',
                target: 'images',
                state: runsByKey.images?.status === 'running' ? 'working' : 'empty',
                startLabel: t('quick.startCreating'),
                startDisabled: !available.text || !available.images,
                onStart: () => void startCardCreation('images', imagesStartOptions),
                aiPlaceholder: t('quick.aiPlaceholderImage'),
                testSuffix: 'images',
              })}
            />
          ) : null}
          <CreativeCard
            href={hrefs.video}
            testId="ad-studio-creative-video"
            title={t('videoTitle')}
            subtitle={effectiveVideo.scenes ? t(videoFormat === 'vertical' ? 'videoVertical' : 'videoHorizontal') : undefined}
            state={effectiveVideo.state}
            highlight={highlightOf({ kind: 'video' })}
            preview={
              effectiveVideo.previewClipId ? (
                <>
                  <video
                    src={withFirstFrame(`${mediaBase}/clips/${effectiveVideo.previewClipId}/media`)}
                    muted
                    playsInline
                    preload="metadata"
                    className={cn('h-full max-w-full bg-black object-cover', videoFormat === 'vertical' ? 'aspect-[9/16]' : 'aspect-video')}
                  />
                  <span className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-pp-primary shadow-md" aria-hidden="true">
                    <Play className="h-5 w-5 translate-x-px fill-current" />
                  </span>
                </>
              ) : (
                <EmptyPreview icon={Clapperboard} />
              )
            }
            facts={
              <>
                <Fact done={effectiveVideo.scenes > 0 && effectiveVideo.rendered === effectiveVideo.scenes}>{effectiveVideo.scenes ? t('videoScenes', { rendered: effectiveVideo.rendered, scenes: effectiveVideo.scenes }) : t('videoNoScript')}</Fact>
                {effectiveVideo.outOfDate > 0 && !effectiveVideo.generating ? (
                  <Fact strong>{t('videoOutOfDate', { count: effectiveVideo.outOfDate })}</Fact>
                ) : effectiveVideo.assembled ? (
                  <Fact done>{t('videoAssembled', { seconds: effectiveVideo.assembledSeconds })}</Fact>
                ) : videoNeedsAssembly(effectiveVideo) ? (
                  <Fact strong>{t('videoNotAssembled')}</Fact>
                ) : null}
                {effectiveVideo.scenes ? <Fact done={effectiveVideo.hasCopy}>{effectiveVideo.hasCopy ? t('copyReady') : t('copyMissing')}</Fact> : null}
              </>
            }
            progress={renderCardProgress('video', () => void startCardCreation('video', videoStartOptions))}
            controls={renderCardControls({
              cardKey: 'video',
              target: 'video',
              state: effectiveVideo.state,
              startLabel: videoStartLabel,
              startDisabled: !available.text || !available.video,
              onStart: videoNeedsWork ? () => void startCardCreation('video', videoStartOptions) : undefined,
              aiPlaceholder: t('quick.aiPlaceholderVideo'),
              testSuffix: 'video',
            })}
          />
          <CreativeCard
            href={hrefs.search}
            testId="ad-studio-creative-search"
            title={t('searchTitle')}
            state={effectiveSearch.state}
            highlight={highlightOf({ kind: 'search' })}
            span={searchSpan(Math.max(effectiveImages.length, 1) + 1)}
            fluidPreview
            preview={
              effectiveSearch.sample ? (
                // Shaped like a Google result: the sponsored label and site, the headlines, the description.
                <div className="m-3 flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border/60 bg-card p-4 text-start shadow-sm" dir={adDirection} data-testid="ad-studio-search-preview">
                  <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-bold text-foreground">{t('searchSponsored')}</span>
                    {searchHost ? (
                      <span dir="ltr" className="truncate">
                        {searchHost}
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-base font-medium leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
                    {effectiveSearch.sampleSecond ? `${effectiveSearch.sample} | ${effectiveSearch.sampleSecond}` : effectiveSearch.sample}
                  </span>
                  {effectiveSearch.sampleDescription ? <span className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{effectiveSearch.sampleDescription}</span> : null}
                </div>
              ) : (
                <EmptyPreview icon={Search} />
              )
            }
            facts={
              <>
                <Fact done={effectiveSearch.state === 'ready'}>{t('searchCounts', { headlines: effectiveSearch.headlines, descriptions: effectiveSearch.descriptions })}</Fact>
                <Fact done={effectiveSearch.keywords > 0}>{t('searchKeywords', { count: effectiveSearch.keywords })}</Fact>
              </>
            }
            progress={renderCardProgress('search', () => void startCardCreation('search', searchStartOptions))}
            controls={renderCardControls({
              cardKey: 'search',
              target: 'search',
              state: effectiveSearch.state,
              startLabel: searchStartLabel,
              startDisabled: !available.text,
              onStart: effectiveSearch.state !== 'ready' ? () => void startCardCreation('search', searchStartOptions) : undefined,
              aiPlaceholder: t('quick.aiPlaceholderSearch'),
              testSuffix: 'search',
            })}
          />
        </ul>
      </section>
    </div>
  );
}
