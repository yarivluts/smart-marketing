'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeft, Check, Circle, ExternalLink, Hand, Lightbulb, ListChecks, Loader2, Minus, Send, SlidersHorizontal, Wallet, Wand2, X } from 'lucide-react';
import {
  GROWTH_MAX_DAILY_BUDGET,
  GROWTH_MIN_DAILY_BUDGET,
  isLiveGrowthPublishStatus,
  isValidGrowthDailyBudget,
  siteHost,
  type GrowthChangeArea,
  type GrowthPerformanceSummary,
  type GrowthPerformanceTotals,
  type GrowthSuggestionThresholds,
} from '@growthos/shared';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import { useLocalDateTime } from '@/components/ad-studio/use-local-date-time';
import { growthNextDecision, growthTargetProgress, mergeActivity, targetActivity, targetChangeAreas, type GrowthStage, type GrowthStageState } from '@/lib/growth-pilot/progress';
import { currentDailyBudget, growthSuggestions, type GrowthSuggestion } from '@/lib/growth-pilot/suggestions';
import { formatBudget, raisedBudget } from '@/lib/growth-pilot/money';
import type { GrowthActivityView, GrowthPilotPageData, GrowthProposalView } from '@/lib/growth-pilot/view';
import { ActivityFeed, ErrorLine, KindChip, ProposalCard, useReason } from './growth-pilot-app';
import { NextDecisionLine, ProgressBar } from './pilot-overview';
import { useGrowthPilot } from './use-growth-pilot';

const SHORT = { dateStyle: 'short', timeStyle: 'short' } as const;

const STATE_STYLE: Record<GrowthStageState, { icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; tone: string }> = {
  done: { icon: Check, tone: 'bg-success text-white' },
  in_progress: { icon: Loader2, tone: 'bg-primary/15 text-primary' },
  waiting: { icon: Hand, tone: 'bg-warning/20 text-warning' },
  failed: { icon: AlertTriangle, tone: 'bg-destructive/10 text-destructive' },
  declined: { icon: X, tone: 'bg-muted text-muted-foreground' },
  not_started: { icon: Circle, tone: 'bg-muted text-muted-foreground' },
  skipped: { icon: Minus, tone: 'bg-muted text-muted-foreground' },
};

function Card({ id, title, icon: Icon, children, testId }: { id: string; title: string; icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; children: React.ReactNode; testId?: string }): React.ReactElement {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby={`${id}-title`} data-testid={testId}>
      <h2 id={`${id}-title`} className="flex items-center gap-2 font-pp-display text-base font-semibold">
        {Icon ? <Icon className="h-4 w-4 text-primary" aria-hidden={true} /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

const DISMISSED_KEY = 'growthos.pilot.dismissedSuggestions';

/** Suggestions this viewer dismissed for a target - a per-browser convenience; never needed for the page to work. */
function useDismissed(targetId: string): [Set<string>, (id: string) => void] {
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    try {
      const all = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '{}') as Record<string, string[]>;
      setDismissed(new Set(all[targetId] ?? []));
    } catch {
      setDismissed(new Set());
    }
  }, [targetId]);
  const dismiss = (id: string) => {
    setDismissed((previous) => {
      const next = new Set(previous).add(id);
      try {
        const all = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '{}') as Record<string, string[]>;
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ...all, [targetId]: [...next] }));
      } catch {
        // Storage may be blocked: the suggestion stays hidden for this visit only.
      }
      return next;
    });
  };
  return [dismissed, dismiss];
}

/** The target's ad numbers for the last 30 days, once it has ads on Meta; null before, or when Meta cannot be read. */
function useTargetResults(base: string, targetId: string, enabled: boolean): GrowthPerformanceTotals | null {
  const [results, setResults] = React.useState<GrowthPerformanceTotals | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${base}/performance?days=30`);
        if (!response.ok) return;
        const body = (await response.json()) as { status: string; summary?: GrowthPerformanceSummary };
        if (!cancelled && body.status === 'ok' && body.summary) setResults(body.summary.byTarget[targetId] ?? null);
      } catch {
        // No numbers is shown as no numbers.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base, targetId, enabled]);
  return results;
}

/** A declined send or turn-on says what that meant (nothing sent / ads stay off); other states use the plain state name. */
function declinedKey(stage: GrowthStage): string | null {
  if (stage.state !== 'declined') return null;
  if (stage.id === 'published') return 'states.declinedPublished';
  if (stage.id === 'live') return 'states.declinedLive';
  return null;
}

function Stepper({ stages }: { stages: GrowthStage[] }): React.ReactElement {
  const t = useTranslations('GrowthPilot.detail');
  const reasonOf = useReason();
  const when = useLocalDateTime(SHORT);
  return (
    <ol className="flex flex-col gap-0" data-testid="growth-pilot-stepper">
      {stages.map((stage, index) => {
        const style = STATE_STYLE[stage.state];
        const Icon = style.icon;
        return (
          <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0" data-testid="growth-pilot-stage" data-stage={stage.id} data-state={stage.state}>
            {index < stages.length - 1 ? <span className="absolute start-[0.9rem] top-8 h-[calc(100%-2rem)] w-px bg-border" aria-hidden="true" /> : null}
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', style.tone)}>
              <Icon className={cn('h-3.5 w-3.5', stage.state === 'in_progress' && 'animate-spin')} aria-hidden={true} />
            </span>
            <span className="flex min-w-0 flex-col pt-0.5">
              <span className={cn('text-sm font-semibold', stage.state === 'skipped' && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{t(`stages.${stage.id}`)}</span>
              <span className="text-xs text-muted-foreground">
                {stage.state === 'failed' ? t('states.failedWhy', { reason: reasonOf(stage.failure) }) : t(declinedKey(stage) ?? `states.${stage.state}`)}
                {stage.state === 'done' && stage.on ? <span className="ms-1.5">{when(stage.on)}</span> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The daily budget of a target's ads on Meta: what it is now, and - for a person who may publish -
 * a change in two explicit steps: type the new amount, then confirm it with the amount and currency
 * spelled out. Nothing is sent before the confirmation.
 */
function BudgetCard({
  amount,
  currency,
  canChange,
  busy,
  draft,
  onDraft,
  onSave,
}: {
  amount: number | null;
  currency: string | null;
  canChange: boolean;
  busy: boolean;
  /** The amount being typed; null while the form is closed. */
  draft: string | null;
  onDraft: (value: string | null) => void;
  onSave: (amount: number) => Promise<boolean>;
}): React.ReactElement {
  const t = useTranslations('GrowthPilot.detail.budget');
  const locale = useLocale();
  const [confirming, setConfirming] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const editing = draft !== null;
  React.useEffect(() => {
    if (editing && !confirming) input.current?.focus();
  }, [editing, confirming]);
  const value = draft === null ? Number.NaN : Number(draft);
  const valid = draft !== null && draft.trim() !== '' && isValidGrowthDailyBudget(value);
  const unchanged = valid && amount !== null && value === amount;
  const close = () => {
    setConfirming(false);
    onDraft(null);
  };
  return (
    <Card id="growth-pilot-budget" title={t('title')} icon={Wallet} testId="growth-pilot-detail-budget">
      <p className="flex flex-col gap-0.5">
        <span className="font-pp-display text-2xl font-bold tabular-nums" data-testid="growth-pilot-budget-current">
          {amount === null ? t('unknown') : t('perDay', { amount: formatBudget(locale, amount, currency) })}
        </span>
        {amount !== null && !currency ? <span className="text-xs text-muted-foreground">{t('accountCurrency')}</span> : null}
      </p>
      {!canChange ? (
        <p className="text-xs text-muted-foreground" data-testid="growth-pilot-budget-needs-owner">
          {t('needsOwner')}
        </p>
      ) : !editing ? (
        <button type="button" disabled={busy} onClick={() => onDraft(amount === null ? '' : String(amount))} className="inline-flex h-9 items-center gap-1.5 self-start rounded-full border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary disabled:opacity-60" data-testid="growth-pilot-budget-change">
          <Wallet className="h-4 w-4" aria-hidden="true" />
          {t('change')}
        </button>
      ) : confirming && valid ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/5 p-3" role="alertdialog" aria-labelledby="growth-pilot-budget-confirm-title" data-testid="growth-pilot-budget-confirm">
          <p id="growth-pilot-budget-confirm-title" className="text-sm font-semibold">
            {t('confirmTitle', { amount: formatBudget(locale, value, currency) })}
          </p>
          <p className="text-xs text-muted-foreground">{currency ? t('confirmBody', { currency }) : t('confirmBodyNoCurrency')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await onSave(value)) close();
                else setConfirming(false);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              data-testid="growth-pilot-budget-confirm-yes"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {t('confirmYes', { amount: formatBudget(locale, value, currency) })}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60" data-testid="growth-pilot-budget-confirm-back">
              {t('confirmBack')}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !unchanged) setConfirming(true);
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t('newAmount')}</span>
            <span className="flex items-center gap-2">
              <input
                ref={input}
                type="number"
                min={GROWTH_MIN_DAILY_BUDGET}
                max={GROWTH_MAX_DAILY_BUDGET}
                step="any"
                inputMode="decimal"
                value={draft ?? ''}
                onChange={(event) => onDraft(event.target.value)}
                className="h-9 w-32 rounded-xl border border-input bg-background px-2 text-sm tabular-nums"
                aria-describedby="growth-pilot-budget-hint"
                aria-invalid={draft !== null && draft.trim() !== '' && !valid ? true : undefined}
                data-testid="growth-pilot-budget-input"
              />
              {currency ? <span className="text-xs font-semibold text-muted-foreground">{currency}</span> : null}
            </span>
          </label>
          <span id="growth-pilot-budget-hint" className={cn('text-xs', draft !== null && draft.trim() !== '' && !valid ? 'text-destructive' : 'text-muted-foreground')}>
            {draft !== null && draft.trim() !== '' && !valid ? t('invalid', { min: GROWTH_MIN_DAILY_BUDGET, max: GROWTH_MAX_DAILY_BUDGET }) : unchanged ? t('unchanged') : t('hint')}
          </span>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!valid || unchanged || busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid="growth-pilot-budget-review">
              {t('review')}
            </button>
            <button type="button" onClick={close} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted" data-testid="growth-pilot-budget-cancel">
              {t('cancel')}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

export interface GrowthTargetDetailProps {
  orgId: string;
  projectId: string;
  targetId: string;
  initial: GrowthPilotPageData | null;
  /** Where connecting a Meta ad account starts; null when the person cannot connect accounts. */
  metaConnectHref?: string | null;
  /** Whether the caller holds `automation.execute`: publishing and turning ads on. */
  canExecute?: boolean;
  /** Whether the caller may decide and ask for changes (`ai.use`); without it the page is read-only. */
  canAct?: boolean;
  /** Whether a video model is configured, so a video ad can be made. */
  videoAvailable?: boolean;
  /** The project's suggestion thresholds (admin setting over platform defaults); the built-in ones when absent. */
  thresholds?: GrowthSuggestionThresholds;
  /** Where the project's admins change those thresholds; null for everyone else. */
  settingsHref?: string | null;
  /** "Now", for the rules that look at how long ads have been on (tests). */
  now?: Date;
}

/**
 * One promoted item, in full: how far it got (an honest percentage over its stages), what is done -
 * with links to each piece - what the pilot is doing now, what waits for the person (with the same
 * buttons as the pilot page), what else can be done, the pilot's suggestions, a box to ask for any
 * change in plain words, and its own activity. The pilot does the work; the person decides.
 */
export function GrowthTargetDetail({ orgId, projectId, targetId, initial, metaConnectHref = null, canExecute = true, canAct = true, videoAvailable = false, thresholds, settingsHref = null, now }: GrowthTargetDetailProps): React.ReactElement {
  const t = useTranslations('GrowthPilot.detail');
  const locale = useLocale();
  const when = useLocalDateTime(SHORT);
  const reasonOf = useReason();
  const base = `/api/orgs/${orgId}/projects/${projectId}/growth-pilot`;
  const pilotHref = `/orgs/${orgId}/projects/${projectId}/growth-pilot`;
  const studio = { media: `/api/orgs/${orgId}/projects/${projectId}/ad-studio`, page: `/orgs/${orgId}/projects/${projectId}/ad-studio` };
  const { data, error, busy, working, run } = useGrowthPilot(base, initial);
  // The page's feed holds the newest lines only: keep every line seen here, so this item's history does not shrink after an action.
  const [activity, setActivity] = React.useState<GrowthActivityView[]>(initial?.activity ?? []);
  React.useEffect(() => {
    if (data) setActivity((previous) => mergeActivity(previous, data.activity));
  }, [data]);
  const target = data?.targets.find((candidate) => candidate.id === targetId) ?? null;
  const hasAds = Boolean(target && (target.publishStatus === 'published' || target.publishStatus === 'running' || target.liveAds > 0));
  const results = useTargetResults(base, targetId, hasAds);
  const [dismissed, dismiss] = useDismissed(targetId);
  const [area, setArea] = React.useState<GrowthChangeArea | null>(null);
  const [text, setText] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [budgetDraft, setBudgetDraft] = React.useState<string | null>(null);

  if (!data || !target) {
    return (
      <section className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 rounded-3xl border border-border/60 bg-card p-6 shadow-soft" data-testid="growth-pilot-detail-missing">
        <h1 className="font-pp-display text-lg font-semibold">{t('missing.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('missing.body')}</p>
        <Link href={pilotHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          {t('back')}
        </Link>
      </section>
    );
  }

  const host = siteHost(data.pilot.siteUrl);
  const pilotActive = data.pilot.status === 'active';
  const progress = growthTargetProgress({ target, proposals: data.proposals, landingPages: data.landingPages, pilotActive, results });
  const mine = data.proposals.filter((proposal) => proposal.targetId === target.id);
  const open = mine.filter((proposal) => proposal.status === 'pending' || proposal.status === 'revising');
  const page = data.landingPages.find((candidate) => candidate.id === target.landingPageId) ?? null;
  const changeAreas = canAct ? targetChangeAreas(target, data.proposals) : [];
  const chosen = area && changeAreas.includes(area) ? area : (changeAreas[0] ?? null);
  const live = isLiveGrowthPublishStatus(target.publishStatus);
  const budgetNow = currentDailyBudget(target, data.proposals);
  const canChangeBudget = canAct && canExecute && live && target.status === 'active';
  const suggestions = canAct
    ? growthSuggestions({ target, proposals: data.proposals, changeAreas, videoAvailable, canChangeBudget, dailyBudget: budgetNow, results, thresholds, now: now ?? new Date() }).filter((suggestion) => !dismissed.has(suggestion.id))
    : [];
  const decision = growthNextDecision(data, { canConnectMeta: Boolean(metaConnectHref), targetId: target.id });
  const doneStages = progress.stages.filter((stage) => stage.state === 'done');
  const runningStages = progress.stages.filter((stage) => stage.state === 'in_progress');
  const pendingChanges = target.changeRequests.filter((change) => change.outcome === 'pending');
  const path = `/targets/${target.id}`;

  const decide = (proposal: GrowthProposalView, action: 'approve' | 'reject', extra?: Record<string, unknown>) => void run(proposal.id, `/proposals/${proposal.id}`, { action, ...extra });
  const revise = (proposal: GrowthProposalView, request: string) => void run(proposal.id, `/proposals/${proposal.id}`, { action: 'revise', request });
  const makeVideo = () => void run('video', path, { action: 'video' });
  const saveBudget = (amount: number) => run('budget', path, { action: 'budget', dailyBudget: amount });
  const applySuggestion = (suggestion: GrowthSuggestion) => {
    if (suggestion.action === 'video') makeVideo();
    // More budget is never sent from here: it opens the budget change, which the person confirms.
    else if (suggestion.action === 'budget') {
      setBudgetDraft(budgetNow === null ? '' : String(raisedBudget(budgetNow)));
      document.getElementById('growth-pilot-budget')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    } else void run(`suggestion-${suggestion.id}`, path, { action: 'change', area: suggestion.area, request: t(`suggestions.${suggestion.id}.request`) });
  };

  /** Where each done stage's piece can be seen. */
  const linkOf = (stage: GrowthStage): { href: string; external: boolean } | null => {
    if (stage.id === 'landing' && page) return { href: `/lp/${page.slug}`, external: true };
    if (!target.briefId) return null;
    if (stage.id === 'images' || stage.id === 'video') return { href: `${studio.page}?brief=${target.briefId}&step=review`, external: false };
    if (stage.id === 'audience' || stage.id === 'published') return { href: `${studio.page}?brief=${target.briefId}&step=publish`, external: false };
    return null;
  };

  const videoSuggested = suggestions.some((suggestion) => suggestion.action === 'video');
  const turnOn = open.find((proposal) => proposal.kind === 'activate' && proposal.status === 'pending');
  const publish = open.find((proposal) => proposal.kind === 'publish' && proposal.status === 'pending');
  // `plain`: a same-page anchor or a full-page address (Meta's connect flow); `tab`: opens in a new tab; `app`: an app route.
  const actions: ({ key: string; onClick: () => void } | { key: string; href: string; as: 'plain' | 'tab' | 'app' })[] = [];
  if (turnOn && canExecute && canAct) actions.push({ key: 'turnOn', href: `#proposal-${turnOn.id}`, as: 'plain' });
  if (publish && canExecute && canAct) actions.push({ key: 'publish', href: `#proposal-${publish.id}`, as: 'plain' });
  if (target.publishStatus === 'needs_meta' && metaConnectHref) actions.push({ key: 'connectMeta', href: metaConnectHref, as: 'plain' });
  if (canAct && videoAvailable && !videoSuggested && target.status === 'active' && target.briefId && (target.adsStatus === 'ready' || target.adsStatus === 'approved') && (target.videoStatus === 'none' || target.videoStatus === 'failed')) actions.push({ key: 'makeVideo', onClick: makeVideo });
  if (changeAreas.length) actions.push({ key: 'askChange', href: '#growth-pilot-change', as: 'plain' });
  if (page && target.landingStatus === 'published') actions.push({ key: 'viewPage', href: `/lp/${page.slug}`, as: 'tab' });
  if (live && target.adsManagerUrl) actions.push({ key: 'adsManager', href: target.adsManagerUrl, as: 'tab' });
  if (target.briefId) actions.push({ key: 'openStudio', href: `${studio.page}?brief=${target.briefId}`, as: 'app' });
  if (settingsHref) actions.push({ key: 'thresholds', href: settingsHref, as: 'app' });

  const history = [
    ...target.changeRequests.map((change) => ({ text: change.text, on: change.on, outcome: change.outcome, failureCode: change.failureCode, area: change.area as string })),
    ...mine.flatMap((proposal) => proposal.changes.map((change) => ({ ...change, area: proposal.kind === 'landing_page' ? 'landing' : proposal.kind }))),
  ].sort((a, b) => b.on.localeCompare(a.on));
  const money = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const number = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });

  return (
    <div className="flex flex-col gap-6" data-testid="growth-pilot-detail">
      <Link href={pilotHref} className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground hover:text-foreground" data-testid="growth-pilot-detail-back">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {t('back')}
      </Link>

      <header className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <KindChip kind={target.kind} />
          {!pilotActive ? <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">{t('paused')}</span> : null}
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="font-pp-display text-2xl font-bold tracking-tight" dir="auto">
            {target.name}
          </h1>
          {target.description ? (
            <p className="text-sm text-muted-foreground" dir="auto">
              {target.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-2">
            <span className="text-sm font-medium">{t('progressTitle')}</span>
            <span className="font-pp-display text-3xl font-bold tabular-nums" data-testid="growth-pilot-detail-percent">
              {t('percent', { percent: progress.percent })}
            </span>
          </div>
          <ProgressBar percent={progress.percent} label={t('progressLabel')} size="lg" />
          <p className="text-xs text-muted-foreground">{t('progressExplain', { done: progress.done, total: progress.applicable })}</p>
        </div>
        <NextDecisionLine decision={decision} names={{ [target.id]: target.name }} metaConnectHref={metaConnectHref} working={working && runningStages.length > 0} />
      </header>

      <ErrorLine code={error} metaConnectHref={metaConnectHref} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card id="growth-pilot-waiting" title={t('waitingTitle')} icon={Hand} testId="growth-pilot-detail-waiting">
            {open.length === 0 && target.publishStatus !== 'needs_meta' ? <p className="text-sm text-muted-foreground">{t('waitingNone')}</p> : null}
            {target.publishStatus === 'needs_meta' ? (
              <p className="text-sm" data-testid="growth-pilot-detail-needs-meta">
                {t('needsMeta')}{' '}
                {metaConnectHref ? (
                  <a href={metaConnectHref} className="font-semibold text-primary hover:underline">
                    {t('actions.connectMeta.title')}
                  </a>
                ) : null}
              </p>
            ) : null}
            {open.length ? (
              <ul className="flex flex-col gap-3">
                {open.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    busy={busy === proposal.id}
                    onDecide={(action, extra) => decide(proposal, action, extra)}
                    onRevise={(request) => revise(proposal, request)}
                    studio={studio}
                    host={host}
                    metaConnectHref={metaConnectHref}
                    landing={proposal.landingPageId ? data.landingPages.find((candidate) => candidate.id === proposal.landingPageId) : null}
                    canExecute={canExecute}
                    readOnly={!canAct}
                  />
                ))}
              </ul>
            ) : null}
          </Card>

          <Card id="growth-pilot-in-progress" title={t('inProgressTitle')} icon={Loader2} testId="growth-pilot-detail-in-progress">
            {runningStages.length === 0 && pendingChanges.length === 0 ? <p className="text-sm text-muted-foreground">{t(pilotActive ? 'inProgressNone' : 'inProgressPaused')}</p> : null}
            <ul className="flex flex-col gap-2">
              {runningStages.map((stage) => (
                <li key={stage.id} className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm">
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                  {t(`inProgress.${stage.id}`)}
                </li>
              ))}
              {pendingChanges.map((change) => (
                <li key={change.on} className="flex items-start gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm" dir="auto">
                  <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {t('inProgressChange', { area: t(`areas.${change.area}`), text: change.text })}
                </li>
              ))}
            </ul>
          </Card>

          {suggestions.length ? (
            <Card id="growth-pilot-suggestions" title={t('suggestionsTitle')} icon={Lightbulb} testId="growth-pilot-detail-suggestions">
              <ul className="flex flex-col gap-3">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.id} className="flex flex-col gap-2 rounded-2xl border border-border/60 p-4" data-testid="growth-pilot-suggestion" data-suggestion={suggestion.id}>
                    <p className="text-sm font-semibold">{t(`suggestions.${suggestion.id}.title`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`suggestions.${suggestion.id}.why`)}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy !== null} onClick={() => applySuggestion(suggestion)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid="growth-pilot-suggestion-apply">
                        {busy === `suggestion-${suggestion.id}` || (suggestion.action === 'video' && busy === 'video') ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
                        {t('suggestionApply')}
                      </button>
                      <button type="button" onClick={() => dismiss(suggestion.id)} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted" data-testid="growth-pilot-suggestion-dismiss">
                        {t('suggestionDismiss')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {settingsHref ? (
                <Link href={settingsHref} className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-primary hover:underline" data-testid="growth-pilot-thresholds-link">
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('thresholdsLink')}
                </Link>
              ) : null}
            </Card>
          ) : null}

          {canAct ? (
            <Card id="growth-pilot-change" title={t('change.title')} icon={Wand2} testId="growth-pilot-detail-change">
              {chosen ? (
                <form
                  className="flex flex-col gap-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!text.trim() || busy) return;
                    setSent(false);
                    if (await run('change', path, { action: 'change', area: chosen, request: text })) {
                      setText('');
                      setSent(true);
                    }
                  }}
                >
                  <p className="text-sm text-muted-foreground">{t('change.hint')}</p>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-xs font-semibold">{t('change.which')}</legend>
                    <div className="flex flex-wrap gap-2">
                      {changeAreas.map((option) => (
                        <label key={option} className={cn('inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm', chosen === option ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border hover:bg-muted')}>
                          <input type="radio" name="growth-pilot-change-area" value={option} checked={chosen === option} onChange={() => setArea(option)} className="sr-only" data-testid={`growth-pilot-change-area-${option}`} />
                          {t(`change.areaLabel.${option}`)}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{t(`change.areaHint.${chosen}`)}</p>
                  </fieldset>
                  <textarea
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      setSent(false);
                    }}
                    rows={3}
                    dir="auto"
                    placeholder={t(`change.placeholder.${chosen}`)}
                    aria-label={t('change.title')}
                    className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                    data-testid="growth-pilot-detail-change-input"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={!text.trim() || busy !== null} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid="growth-pilot-detail-change-send">
                      {busy === 'change' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                      {t('change.send')}
                    </button>
                    {sent ? (
                      <span className="text-sm font-medium text-success" role="status" data-testid="growth-pilot-detail-change-sent">
                        {t('change.sent')}
                      </span>
                    ) : null}
                  </div>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="growth-pilot-detail-change-unavailable">
                  {t(target.status === 'active' ? 'change.unavailable' : 'change.notActive')}
                </p>
              )}
              {history.length ? (
                <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
                  <h3 className="text-xs font-semibold text-muted-foreground">{t('change.history')}</h3>
                  <ul className="flex flex-col gap-2" data-testid="growth-pilot-detail-change-history">
                    {history.map((item) => (
                      <li key={`${item.on}-${item.text}`} className="flex flex-col gap-0.5 rounded-xl bg-muted/50 px-3 py-2 text-xs">
                        <span className="font-medium text-foreground" dir="auto">
                          {item.text}
                        </span>
                        <span className={cn(item.outcome === 'failed' ? 'text-warning' : item.outcome === 'done' ? 'text-success' : 'text-primary')}>
                          {item.outcome === 'failed' ? t('change.outcome.failed', { reason: reasonOf(item.failureCode) }) : t(`change.outcome.${item.outcome}`)}
                          <span className="ms-1.5 text-muted-foreground">{when(item.on)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ) : (
            <p className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground" data-testid="growth-pilot-detail-read-only">
              {t('readOnly')}
            </p>
          )}

          <ActivityFeed activity={targetActivity(activity, target)} title={t('activityTitle')} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card id="growth-pilot-steps" title={t('stepsTitle')} icon={ListChecks}>
            <Stepper stages={progress.stages} />
          </Card>

          {results ? (
            <Card id="growth-pilot-results" title={t('resultsTitle')} testId="growth-pilot-detail-results">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {(
                  [
                    ['clicks', number.format(results.clicks)],
                    ['impressions', number.format(results.impressions)],
                    ['spend', money.format(results.spend)],
                    ['conversions', number.format(results.conversions)],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="flex flex-col rounded-xl bg-muted/50 px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{t(`results.${key}`)}</dt>
                    <dd className="font-pp-display text-lg font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">{t('resultsNote')}</p>
            </Card>
          ) : null}

          {live ? <BudgetCard amount={budgetNow} currency={target.budgetCurrency} canChange={canChangeBudget} busy={busy !== null} draft={canChangeBudget ? budgetDraft : null} onDraft={setBudgetDraft} onSave={saveBudget} /> : null}

          <Card id="growth-pilot-done" title={t('doneTitle')} icon={Check} testId="growth-pilot-detail-done">
            {doneStages.length === 0 ? <p className="text-sm text-muted-foreground">{t('doneNone')}</p> : null}
            <ul className="flex flex-col gap-2">
              {doneStages.map((stage) => {
                const link = linkOf(stage);
                return (
                  <li key={stage.id} className="flex flex-col gap-0.5 rounded-xl bg-success/5 px-3 py-2 text-sm" data-testid="growth-pilot-done-item" data-stage={stage.id}>
                    <span className="flex items-center gap-1.5 font-medium">
                      <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      {t(`done.${stage.id}`)}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {stage.on ? <span>{when(stage.on)}</span> : null}
                      {(stage.id === 'published' || stage.id === 'live') && target.adsManagerUrl ? (
                        <a href={target.adsManagerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline" data-testid="growth-pilot-done-ads-manager">
                          {t('adsManagerLink')}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      ) : null}
                      {link ? (
                        link.external ? (
                          <a href={link.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline" data-testid="growth-pilot-done-link">
                            {t(`doneLink.${stage.id}`)}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        ) : (
                          <Link href={link.href} className="font-semibold text-primary hover:underline" data-testid="growth-pilot-done-link">
                            {t(`doneLink.${stage.id}`)}
                          </Link>
                        )
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {actions.length ? (
            <Card id="growth-pilot-more" title={t('moreTitle')} icon={Lightbulb} testId="growth-pilot-detail-more">
              <ul className="flex flex-col gap-2">
                {actions.map((action) => {
                  const body = (
                    <>
                      <span className="text-sm font-semibold text-primary">{t(`actions.${action.key}.title`)}</span>
                      <span className="text-xs text-muted-foreground">{t(`actions.${action.key}.why`)}</span>
                    </>
                  );
                  const style = 'flex w-full flex-col items-start gap-0.5 rounded-xl border border-border/60 px-3 py-2 text-start hover:bg-muted';
                  return (
                    <li key={action.key} data-testid="growth-pilot-action" data-action={action.key}>
                      {'onClick' in action ? (
                        <button type="button" disabled={busy !== null} onClick={action.onClick} className={cn(style, 'disabled:opacity-60')}>
                          {body}
                        </button>
                      ) : action.as === 'app' ? (
                        <Link href={action.href} className={style}>
                          {body}
                        </Link>
                      ) : (
                        <a href={action.href} className={style} {...(action.as === 'tab' ? { target: '_blank', rel: 'noopener' } : {})}>
                          {body}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
