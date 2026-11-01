'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { normalizeSiteUrl, siteHost } from '@growthos/shared';
import { AlertTriangle, ArrowLeft, Check, ExternalLink, Eye, FileText, Globe, ImageIcon, Loader2, MapPin, Power, Send, UserRound, Megaphone, Package, Pause, Play, Plus, ShieldCheck, Sparkles, Target, Users, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import { growthPilotHasPendingWork, waitingProposals, type GrowthActivityView, type GrowthLandingPageView, type GrowthPilotPageData, type GrowthProposalView, type GrowthTargetView } from '@/lib/growth-pilot/view';
import { useLocalDateTime } from '@/components/ad-studio/use-local-date-time';
import { isolate } from '@/lib/bidi';
import { GrowthLandingView } from './landing-view';
import { GrowthPerformanceSection } from './performance-section';
import type { GrowthPerformanceTotals } from '@growthos/shared';

const KIND_ICON = { product: Package, service: Megaphone, audience: Users } as const;
const SHORT = { dateStyle: 'short', timeStyle: 'short' } as const;
/** While the site is read in another tab or request, how often this page looks again. */
export const GROWTH_PILOT_POLL_MS = 5000;
/** Between units of ads work (each call already takes as long as one step). */
export const GROWTH_PILOT_STEP_MS = 1500;

type ApiResult = { ok: true; data: GrowthPilotPageData | null } | { ok: false; error: string };

/** Calls a Growth Pilot route and returns the page data it answers with, or the error code. */
async function callPilot(base: string, path: string, body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const json = (await response.json().catch(() => ({}))) as GrowthPilotPageData & { error?: string; code?: string; pilot: unknown };
    if (response.status === 401) return { ok: false, error: 'unauthorized' };
    if (response.status === 403) return { ok: false, error: 'forbidden' };
    if (!response.ok) {
      if (json.error === 'provider_failed' && (json.code === 'not_configured' || json.code === 'provider_billing')) return { ok: false, error: 'ai_unavailable' };
      if (json.error === 'provider_failed' && json.code === 'quota_exceeded') return { ok: false, error: 'quota_exceeded' };
      return { ok: false, error: typeof json.error === 'string' ? json.error : 'generic' };
    }
    return { ok: true, data: json.pilot ? json : null };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

function failureKey(code: string | null): 'site' | 'slow' | 'looping' | 'blocked' | 'unreadable' | 'quota_exceeded' | 'nothing_found' | 'unavailable' | 'provider' {
  if (!code) return 'provider';
  if (code === 'site_blocked_url') return 'blocked';
  if (code === 'site_not_html' || code === 'site_empty_page') return 'unreadable';
  if (code === 'site_timeout') return 'slow';
  if (code === 'site_too_many_redirects') return 'looping';
  if (code.startsWith('site_')) return 'site';
  if (code === 'quota_exceeded' || code === 'nothing_found') return code;
  if (code === 'provider_billing' || code === 'not_configured') return 'unavailable';
  return 'provider';
}

const KNOWN_REASONS = ['quota_exceeded', 'provider_error', 'invalid_output', 'no_images', 'publish_failed', 'auth_failed', 'account_action_required', 'meta_account_restricted', 'rejected', 'no_secret', 'rate_limited', 'refused', 'provider_billing', 'not_configured', 'upload_failed', 'cancelled', 'nothing_to_revise', 'platform_busy', 'timed_out', 'no_concepts'];

/** A stored failure code in plain words; an unknown code never reaches the screen. */
function useReason(): (code: string | null | undefined) => string {
  const t = useTranslations('GrowthPilot.reasons');
  return (code) => t(code && KNOWN_REASONS.includes(code) ? (code as 'generic') : 'generic');
}

/** Country codes as names in the reader's language ("IL" -> "Israel"); a code the browser does not know stays as it is. */
function useCountryNames(): (codes: string[]) => string {
  const locale = useLocale();
  return (codes) => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames(locale, { type: 'region' });
    } catch {
      names = null;
    }
    return codes.map((code) => { try { return names?.of(code) ?? code; } catch { return code; } }).join(', ');
  };
}

const EMAIL_PATTERN = /^(mailto:)?[^\s@/]+@[^\s@/]+\.[^\s@/]+$/i;

function ErrorLine({ code, id }: { code: string | null; id?: string }): React.ReactElement | null {
  const t = useTranslations('GrowthPilot.errors');
  if (!code) return null;
  const known = ['invalid_site', 'invalid_site_email', 'empty_request', 'quota_exceeded', 'provider_failed', 'ai_unavailable', 'not_pending', 'not_ready', 'not_found', 'invalid_budget', 'automation_stopped', 'meta_unavailable', 'offline', 'unauthorized', 'forbidden'].includes(code);
  return (
    <p id={id} role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t(known ? (code as 'generic') : 'generic')}
    </p>
  );
}

/** The first screen: one input, the website. */
function StartScreen({ onStart, pending, error, onCancel }: { onStart: (url: string) => void; pending: boolean; error: string | null; onCancel?: () => void }): React.ReactElement {
  const t = useTranslations('GrowthPilot.start');
  const tf = useTranslations('GrowthPilot.failed');
  const [url, setUrl] = React.useState('');
  const [mistake, setMistake] = React.useState<string | null>(null);
  const steps = [
    { key: 'read', icon: Globe },
    { key: 'propose', icon: Target },
    { key: 'build', icon: Wand2 },
    { key: 'watch', icon: Sparkles },
  ] as const;
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-6 text-center sm:py-12" data-testid="growth-pilot-start">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {t('eyebrow')}
      </span>
      <h1 className="font-pp-display text-3xl font-bold tracking-tight [text-wrap:balance] sm:text-5xl">{t('title')}</h1>
      <p className="max-w-2xl text-base text-muted-foreground [text-wrap:balance]">{t('subtitle')}</p>
      <form
        className="flex w-full flex-col gap-2 rounded-3xl border border-border/60 bg-card p-2 shadow-soft-lg sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          // An email is the commonest wrong paste: say so at once instead of a round trip to a vague refusal.
          if (EMAIL_PATTERN.test(url.trim())) {
            setMistake('invalid_site_email');
            return;
          }
          // The same check the server makes: a word that is not an address ("my shop") is answered at once.
          if (!normalizeSiteUrl(url)) {
            setMistake('invalid_site');
            return;
          }
          setMistake(null);
          onStart(url);
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <Globe className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{t('label')}</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            dir="ltr"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setMistake(null);
            }}
            placeholder={t('placeholder')}
            aria-describedby={mistake ?? error ? 'growth-pilot-site-error growth-pilot-site-hint' : 'growth-pilot-site-hint'}
            aria-invalid={mistake ?? error ? true : undefined}
            className="h-12 min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted-foreground/60"
            data-testid="growth-pilot-site-input"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !url.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-7 text-base font-semibold text-primary-foreground shadow-glow transition hover:bg-primary/90 disabled:opacity-60"
          data-testid="growth-pilot-start-button"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-5 w-5" aria-hidden="true" />}
          {t('submit')}
        </button>
      </form>
      <p id="growth-pilot-site-hint" className="-mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
        <span>{t('hint')}</span>
        <span>{t('noSite')}</span>
      </p>
      <ErrorLine code={mistake ?? error} id="growth-pilot-site-error" />
      <ol className="flex flex-wrap justify-center gap-2">
        {steps.map((step, index) => (
          <li key={step.key} className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{index + 1}</span>
            <step.icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {t(`steps.${step.key}`)}
          </li>
        ))}
      </ol>
      {onCancel ? (
        <p className="max-w-xl text-sm text-muted-foreground" data-testid="growth-pilot-start-over-note">
          {t('startOverNote')}
        </p>
      ) : null}
      {onCancel ? (
        <button type="button" onClick={onCancel} className="text-sm font-medium text-muted-foreground hover:text-foreground">
          {tf('back')}
        </button>
      ) : null}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
        {t('safe')}
      </p>
    </section>
  );
}

/** While the site is read: what is happening, honestly - one moving bar, no invented progress. */
function AnalyzingCard({ host, error }: { host: string; error: string | null }): React.ReactElement {
  const t = useTranslations('GrowthPilot.analyzing');
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-soft" aria-busy="true" data-testid="growth-pilot-analyzing">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-pp-display text-lg font-semibold" role="status">
            {t('title', { host: isolate(host) })}
          </h2>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full w-1/3 animate-growth-pilot-scan rounded-full bg-primary" />
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {(['pages', 'offerings', 'audiences', 'proposals'] as const).map((key) => (
          <li key={key} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-muted-foreground">
            <Sparkles className="h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
            {t(`items.${key}`)}
          </li>
        ))}
      </ul>
      <ErrorLine code={error} />
    </section>
  );
}

function FailedCard({ host, code, onRetry, onOther, pending }: { host: string; code: string | null; onRetry: () => void; onOther: () => void; pending: boolean }): React.ReactElement {
  const t = useTranslations('GrowthPilot');
  const kind = failureKey(code);
  // Trying the same address again cannot help when nothing was found, the address is private or has no text, today's AI limit is gone or the AI is not available on our side - offer only what can work.
  const canRetry = kind === 'site' || kind === 'slow' || kind === 'provider';
  const canUseOther = kind !== 'quota_exceeded' && kind !== 'unavailable';
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-3xl border border-warning/40 bg-card p-6 shadow-soft" data-testid="growth-pilot-failed">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="font-pp-display text-lg font-semibold">{t('failed.title', { host: isolate(host) })}</h2>
          <p className="text-sm text-muted-foreground">{t(`failure.${failureKey(code)}`)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {canRetry ? (
          <button type="button" onClick={onRetry} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t('failed.retry')}
          </button>
        ) : null}
        {canUseOther ? (
          <button type="button" onClick={onOther} className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted">
            {t('failed.other')}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function KindChip({ kind }: { kind: GrowthTargetView['kind'] }): React.ReactElement {
  const t = useTranslations('GrowthPilot.kind');
  const Icon = KIND_ICON[kind];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {t(kind)}
    </span>
  );
}

/** One proposal waiting for the person: approve, reject, or tell the AI what to change. */
function ProposalCard({
  proposal,
  busy,
  onDecide,
  onRevise,
  studio,
  landing,
  host,
  metaConnectHref,
  canExecute = true,
}: {
  proposal: GrowthProposalView;
  busy: boolean;
  onDecide: (action: 'approve' | 'reject', extra?: Record<string, unknown>) => void;
  onRevise: (text: string) => void;
  /** Where the Ad Studio lives for this project: ads previews and the link to edit them. */
  studio: { media: string; page: string };
  /** The landing page a `landing_page` proposal is about. */
  landing?: GrowthLandingPageView | null;
  host: string;
  /** Where to connect the Meta ad account, shown when the audience step is waiting for it. */
  metaConnectHref?: string | null;
  /** Whether the caller holds `automation.execute` — required by `/proposals/[proposalId]` to approve `publish` or `activate`. */
  canExecute?: boolean;
}): React.ReactElement | null {
  const t = useTranslations('GrowthPilot.waiting');
  const ta = useTranslations('GrowthPilot.ads');
  const ads = proposal.kind === 'ads';
  const page = proposal.kind === 'landing_page' ? (landing ?? null) : null;
  const tl = useTranslations('GrowthPilot.landing');
  const [previewing, setPreviewing] = React.useState(false);
  const audience = proposal.kind === 'audience' ? proposal.audience : null;
  const platform = proposal.kind === 'publish' || proposal.kind === 'activate' ? proposal.publish : null;
  const tp = useTranslations('GrowthPilot.publish');
  const reasonOf = useReason();
  const countryNames = useCountryNames();
  const [budget, setBudget] = React.useState(String(proposal.publish?.dailyBudget ?? ''));
  const tu = useTranslations('GrowthPilot.audience');
  const [changing, setChanging] = React.useState(false);
  const [confirmingOn, setConfirmingOn] = React.useState(false);
  const [text, setText] = React.useState('');
  const draft = proposal.draft;
  const revising = proposal.status === 'revising';
  const last = proposal.changes.at(-1);
  if (!draft) return null;
  return (
    <li className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" data-testid="growth-pilot-proposal" aria-busy={revising || busy}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {proposal.kind === 'publish' ? <Send className="h-5 w-5" aria-hidden="true" /> : proposal.kind === 'activate' ? <Power className="h-5 w-5" aria-hidden="true" /> : ads ? <ImageIcon className="h-5 w-5" aria-hidden="true" /> : audience ? <Users className="h-5 w-5" aria-hidden="true" /> : page ? <FileText className="h-5 w-5" aria-hidden="true" /> : React.createElement(KIND_ICON[draft.kind], { className: 'h-5 w-5', 'aria-hidden': true })}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-pp-display text-base font-semibold" dir="auto">
              {proposal.kind === 'publish' ? tp('title', { name: isolate(draft.name) }) : proposal.kind === 'activate' ? tp('activateTitle', { name: isolate(draft.name) }) : ads ? ta('title', { name: isolate(draft.name) }) : audience ? tu('title', { name: isolate(draft.name) }) : page ? tl('title', { name: isolate(draft.name) }) : draft.name}
            </h3>
            <KindChip kind={draft.kind} />
          </div>
          {ads ? <p className="text-sm text-muted-foreground">{ta('description')}</p> : null}
          {page ? <p className="text-sm text-muted-foreground">{tl('explain')}</p> : null}
          {page ? (
            <p className="text-sm text-muted-foreground" dir={page.dir}>
              <span className="font-semibold text-foreground">{page.content.headline}</span> - {page.content.subheadline}
            </p>
          ) : null}
          {audience ? <AudienceSummary plan={audience} metaConnectHref={metaConnectHref ?? null} /> : null}
          {platform ? (
            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground" data-testid="growth-pilot-publish">
              <p>{proposal.kind === 'publish' ? tp('description', { count: platform.imageIds.length }) : tp('activateDescription', { budget: platform.dailyBudget })}</p>
              <p className="truncate text-xs">
                <span className="font-semibold text-foreground">{tp('link')}: </span>
                <a href={platform.linkUrl} target="_blank" rel="noopener" className="text-primary hover:underline" dir="ltr">
                  {platform.linkUrl}
                </a>
              </p>
              <p className="text-xs">
                <span className="font-semibold text-foreground">{tp('countries')}: </span>
                <span dir="auto">{countryNames(platform.countries)}</span>
              </p>
            </div>
          ) : null}
          {!ads && !page && !audience && !platform && draft.description ? (
            <p className="text-sm text-muted-foreground" dir="auto">
              {draft.description}
            </p>
          ) : null}
          {!ads && !page && !audience && !platform && draft.audience ? (
            <p className="text-xs text-muted-foreground" dir="auto">
              <span className="font-semibold text-foreground">{t('for')}: </span>
              {draft.audience}
            </p>
          ) : null}
          {draft.reason && draft.reason !== draft.audience && draft.reason !== draft.description ? (
            <p className="flex items-start gap-1.5 text-xs text-primary" dir="auto">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {draft.reason}
            </p>
          ) : null}
        </div>
      </div>
      {(ads || proposal.kind === 'publish') && proposal.briefId && proposal.previewImageIds.length ? (
        <ul className="flex flex-wrap gap-2" data-testid="growth-pilot-ads-preview">
          {proposal.previewImageIds.map((imageId, index) => (
            <li key={imageId} className="h-28 overflow-hidden rounded-2xl bg-muted">
              {/* A plain img: private media from our own authenticated route, in its own shape. */}
              <img src={`${studio.media}/briefs/${proposal.briefId}/images/${imageId}/media`} alt={ta('previewAlt', { number: index + 1, total: proposal.previewImageIds.length })} className="h-full w-auto object-contain" />
            </li>
          ))}
        </ul>
      ) : null}
      {ads && proposal.briefId ? (
        <Link href={`${studio.page}?brief=${proposal.briefId}&step=review`} className="inline-flex items-center gap-1 self-start text-xs font-semibold text-primary hover:underline" data-testid="growth-pilot-open-studio">
          {ta('open')}
          <ArrowLeft className="h-3.5 w-3.5 ltr:rotate-180" aria-hidden="true" />
        </Link>
      ) : null}
      {page ? (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setPreviewing(!previewing)} aria-expanded={previewing} className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-primary hover:underline" data-testid="growth-pilot-landing-toggle">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {tl(previewing ? 'hidePreview' : 'preview')}
          </button>
          {previewing ? (
            <div className="overflow-hidden rounded-2xl border border-border" data-testid="growth-pilot-landing-preview">
              <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-3 py-1.5" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                <span className="ms-2 truncate text-[11px] text-muted-foreground" dir="ltr">/lp/{page.slug}</span>
              </div>
              <div className="max-h-[32rem] overflow-y-auto">
                <GrowthLandingView content={page.content} ctaUrl={page.ctaUrl} dir={page.dir} host={host} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {last ? (
        <p className={cn('rounded-xl px-3 py-2 text-xs', last.outcome === 'failed' ? 'bg-warning/10 text-warning' : 'bg-muted/60 text-muted-foreground')} dir="auto">
          {last.outcome === 'failed' ? t('changeFailed', { reason: reasonOf(last.failureCode) }) : t('asked', { text: last.text })}
        </p>
      ) : null}
      {revising ? (
        <p className="flex items-center gap-2 text-sm font-medium text-primary" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {ads ? ta('revising') : audience ? tu('revising') : page ? tl('revising') : t('revising')}
        </p>
      ) : changing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onRevise(text);
            setChanging(false);
            setText('');
          }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={ads ? ta('changePlaceholder') : audience ? tu('changePlaceholder') : page ? tl('changePlaceholder') : t('changePlaceholder')}
            rows={2}
            dir="auto"
            className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
            aria-label={t('change')}
            data-testid="growth-pilot-change-input"
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!text.trim() || busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              {t('send')}
            </button>
            <button type="button" onClick={() => setChanging(false)} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted">
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {proposal.kind === 'publish' && canExecute ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium">{tp('budget')}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="decimal"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  className="h-9 w-24 rounded-xl border border-input bg-background px-2 text-sm tabular-nums"
                  data-testid="growth-pilot-budget"
                  aria-describedby="growth-pilot-budget-hint"
                />
              </span>
              <span id="growth-pilot-budget-hint" className={Number(budget) > 0 || budget.trim() === '' ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
                {Number(budget) > 0 ? tp('budgetHint') : budget.trim() === '' ? tp('budgetStart') : tp('budgetNeeded')}
              </span>
            </label>
          ) : null}
          {!platform || canExecute ? (
            <button type="button" disabled={busy || (proposal.kind === 'publish' && !(Number(budget) > 0))} onClick={() => (proposal.kind === 'activate' && !confirmingOn ? setConfirmingOn(true) : onDecide('approve', proposal.kind === 'publish' ? { dailyBudget: Number(budget) } : undefined))} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid="growth-pilot-approve">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {proposal.kind === 'publish' ? tp('approve') : proposal.kind === 'activate' ? (confirmingOn ? tp('confirmActivate', { budget: platform?.dailyBudget ?? 0 }) : tp('activate')) : t('approve')}
            </button>
          ) : null}
          {confirmingOn && !busy ? (
            <button type="button" onClick={() => setConfirmingOn(false)} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted" data-testid="growth-pilot-activate-cancel">
              {tp('confirmCancel')}
            </button>
          ) : null}
          {platform ? null : (
          <button type="button" disabled={busy} onClick={() => setChanging(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary disabled:opacity-60" data-testid="growth-pilot-change">
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            {t('change')}
          </button>
          )}
          <button type="button" disabled={busy} onClick={() => onDecide('reject')} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60" data-testid="growth-pilot-reject">
            <X className="h-4 w-4" aria-hidden="true" />
            {t('reject')}
          </button>
          {platform && !canExecute ? (
            <p className="basis-full text-xs text-muted-foreground" data-testid="growth-pilot-needs-owner">
              {t('needsOwner')}
            </p>
          ) : null}
          {platform ? null : (
            <p className="basis-full text-xs text-muted-foreground" data-testid="growth-pilot-approve-hint">
              {t(`approveHint.${ads ? 'ads' : audience ? 'audience' : page ? 'landing' : 'target'}`)}
            </p>
          )}
          <p className="basis-full text-xs text-muted-foreground" data-testid="growth-pilot-reject-hint">
            {t(proposal.kind === 'publish' ? 'rejectHintPublish' : proposal.kind === 'activate' ? 'rejectHintActivate' : 'rejectHint')}
          </p>
        </div>
      )}
    </li>
  );
}

function TargetCard({ target, landingSlug, metaConnectHref, results }: { target: GrowthTargetView; landingSlug: string | null; metaConnectHref: string | null; results?: GrowthPerformanceTotals | null }): React.ReactElement {
  const t = useTranslations('GrowthPilot.targets');
  return (
    <li className="flex flex-col gap-2 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" data-testid="growth-pilot-target">
      <div className="flex items-start justify-between gap-2">
        <KindChip kind={target.kind} />
        <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', target.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>{t(`status.${target.status}`)}</span>
      </div>
      <h3 className="font-pp-display text-base font-semibold" dir="auto">
        {target.name}
      </h3>
      {target.description ? (
        <p className="line-clamp-3 text-sm text-muted-foreground" dir="auto">
          {target.description}
        </p>
      ) : null}
      {target.origin === 'request' ? <span className="text-[11px] text-muted-foreground">{t('requested')}</span> : null}
      <TargetLandingLine target={target} slug={landingSlug} />
      <TargetAudienceLine target={target} />
      <TargetPublishLine target={target} metaConnectHref={metaConnectHref} results={results} />
      <TargetAdsLine target={target} />
    </li>
  );
}

/** Where the target's landing page stands; once published, its public address. */
function TargetLandingLine({ target, slug }: { target: GrowthTargetView; slug: string | null }): React.ReactElement | null {
  const reasonOf = useReason();
  const t = useTranslations('GrowthPilot.landing.status');
  if (target.status !== 'active' || target.landingStatus === 'none') return null;
  const status = target.landingStatus;
  return (
    <p className={cn('mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-xs', status === 'published' ? 'text-success' : status === 'failed' ? 'text-warning' : 'text-muted-foreground')} data-testid="growth-pilot-target-landing" data-landing={status}>
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      {status === 'failed' ? t('failed', { reason: reasonOf(target.landingFailure) }) : t(status)}
      {status === 'published' && slug ? (
        <a href={`/lp/${slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline" data-testid="growth-pilot-landing-link">
          {t('open')}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
    </p>
  );
}

/** Where the target's ads stand on the platform; when Meta is missing, the way to connect it. */
function TargetPublishLine({ target, metaConnectHref, results }: { target: GrowthTargetView; metaConnectHref: string | null; results?: GrowthPerformanceTotals | null }): React.ReactElement | null {
  const reasonOf = useReason();
  const t = useTranslations('GrowthPilot.publish.status');
  const tr = useTranslations('GrowthPilot.performance');
  const locale = useLocale();
  if (target.status !== 'active' || target.publishStatus === 'none') return null;
  const status = target.publishStatus;
  return (
    <p className={cn('flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-xs', status === 'running' ? 'text-success' : status === 'failed' || status === 'needs_meta' ? 'text-warning' : 'text-muted-foreground')} data-testid="growth-pilot-target-publish" data-publish={status}>
      <Send className="h-3.5 w-3.5" aria-hidden="true" />
      {status === 'failed' ? t('failed', { reason: reasonOf(target.publishFailure === 'quota_exceeded' ? 'platform_busy' : target.publishFailure) }) : t(status)}
      {results && (status === 'published' || status === 'running') ? (
        <span className="font-semibold text-foreground" data-testid="growth-pilot-target-results">
          {tr('targetResults', { clicks: new Intl.NumberFormat(locale).format(results.clicks), spend: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(results.spend) })}
        </span>
      ) : null}
      {status === 'needs_meta' && metaConnectHref ? (
        <a href={metaConnectHref} className="font-semibold text-primary hover:underline" data-testid="growth-pilot-connect-meta">
          {t('connect')}
        </a>
      ) : null}
    </p>
  );
}

/** Where the target's audience stands. */
function TargetAudienceLine({ target }: { target: GrowthTargetView }): React.ReactElement | null {
  const reasonOf = useReason();
  const t = useTranslations('GrowthPilot.audience.status');
  if (target.status !== 'active' || target.audienceStatus === 'none') return null;
  const status = target.audienceStatus;
  return (
    <p className={cn('flex items-center gap-1.5 border-t border-border/60 pt-2 text-xs', status === 'approved' ? 'text-success' : status === 'failed' ? 'text-warning' : 'text-muted-foreground')} data-testid="growth-pilot-target-audience" data-audience={status}>
      <Users className="h-3.5 w-3.5" aria-hidden="true" />
      {status === 'failed' ? t('failed', { reason: reasonOf(target.audienceFailure) }) : t(status)}
    </p>
  );
}

/** An audience proposal: who, where, which interests, and how many people Meta says it reaches. */
function AudienceSummary({ plan, metaConnectHref }: { plan: NonNullable<GrowthProposalView['audience']>; metaConnectHref: string | null }): React.ReactElement {
  const t = useTranslations('GrowthPilot.audience');
  const countryNames = useCountryNames();
  const tc = useTranslations('GrowthPilot.publish.status');
  const missingMeta = plan.meta === 'no_meta_credential' || plan.meta === 'credential_not_configured';
  const number = new Intl.NumberFormat(useLocale(), { notation: 'compact', maximumFractionDigits: 1 });
  const genders = plan.targeting.genders.length ? plan.targeting.genders.map((gender) => t(`gender.${gender}`)).join(', ') : t('gender.all');
  return (
    <div className="flex flex-col gap-2" data-testid="growth-pilot-audience">
      {plan.summary ? (
        <p className="text-sm text-muted-foreground" dir="auto">
          {plan.summary}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
          <MapPin className="h-3 w-3" aria-hidden="true" />
          <span dir="auto">{countryNames(plan.targeting.countries)}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
          <UserRound className="h-3 w-3" aria-hidden="true" />
          {t('ages', { min: plan.targeting.ageMin, max: plan.targeting.ageMax === 65 ? '65+' : String(plan.targeting.ageMax) })} · {genders}
        </span>
        {plan.targeting.interests.map((interest) => (
          <span key={interest.id} className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary" dir="auto" data-testid="growth-pilot-audience-interest">
            {interest.name}
          </span>
        ))}
        {plan.unresolvedInterests.map((word) => (
          <span key={word} className="rounded-full border border-dashed border-border px-2.5 py-1 text-muted-foreground" dir="auto">
            {word}
          </span>
        ))}
      </div>
      {plan.reach && plan.reach.lower !== null && plan.reach.upper !== null ? (
        <p className="text-xs font-semibold text-foreground" data-testid="growth-pilot-audience-reach">
          {t('reach', { lower: number.format(plan.reach.lower), upper: number.format(plan.reach.upper) })}
        </p>
      ) : null}
      {plan.meta !== 'ok' ? (
        <p className="text-xs text-muted-foreground" data-testid="growth-pilot-audience-meta">
          {t(missingMeta ? 'metaMissing' : 'metaFailed')}
          {missingMeta && metaConnectHref ? (
            <>
              {' '}
              <a href={metaConnectHref} className="font-semibold text-primary hover:underline" data-testid="growth-pilot-audience-connect-meta">
                {tc('connect')}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** Where the target's ads stand, at the foot of its card. */
function TargetAdsLine({ target }: { target: GrowthTargetView }): React.ReactElement {
  const reasonOf = useReason();
  const t = useTranslations('GrowthPilot.targets');
  const ta = useTranslations('GrowthPilot.ads.status');
  const status = target.status === 'active' ? target.adsStatus : 'none';
  const tone = status === 'failed' ? 'text-warning' : status === 'approved' ? 'text-success' : status === 'building' ? 'text-primary' : 'text-muted-foreground';
  return (
    <p className={cn('mt-auto flex items-center gap-1.5 border-t border-border/60 pt-2 text-xs', tone)} data-testid="growth-pilot-target-ads" data-ads={status}>
      {status === 'building' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
      {status === 'none' ? t('next') : status === 'failed' ? ta('failed', { reason: reasonOf(target.adsFailure) }) : ta(status)}
    </p>
  );
}

function ActivityFeed({ activity }: { activity: GrowthActivityView[] }): React.ReactElement {
  const t = useTranslations('GrowthPilot.activity');
  const when = useLocalDateTime(SHORT);
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby="growth-pilot-activity">
      <h2 id="growth-pilot-activity" className="font-pp-display text-base font-semibold">
        {t('title')}
      </h2>
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="growth-pilot-activity">
          {activity.map((row) => (
            <li key={row.id} className="flex gap-3 text-sm">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', row.byPilot ? 'bg-primary' : 'bg-success')} aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span dir="auto">{t(`kind.${row.kind}`, { subject: row.subject ?? '', count: row.count ?? 0 })}</span>
                <span className="text-[11px] text-muted-foreground">{when(row.on)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export interface GrowthPilotAppProps {
  orgId: string;
  projectId: string;
  initial: GrowthPilotPageData | null;
  /** Where connecting a Meta ad account starts (and returns here); null when the person cannot connect accounts. */
  metaConnectHref?: string | null;
  /** Whether the caller holds `automation.execute` — required to approve `publish` and `activate` proposals. */
  canExecute?: boolean;
}

/**
 * Growth Pilot, the one-input marketing autopilot: the person enters their website, the AI reads it
 * and proposes what to grow, and every proposal waits for the person - approve, reject, or ask the AI
 * for a change. The person can pause the pilot or ask for more targets at any time.
 */
export function GrowthPilotApp({ orgId, projectId, initial, metaConnectHref, canExecute = true }: GrowthPilotAppProps): React.ReactElement {
  const t = useTranslations('GrowthPilot');
  const base = `/api/orgs/${orgId}/projects/${projectId}/growth-pilot`;
  const studio = { media: `/api/orgs/${orgId}/projects/${projectId}/ad-studio`, page: `/orgs/${orgId}/projects/${projectId}/ad-studio` };
  const [data, setData] = React.useState<GrowthPilotPageData | null>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [startingOver, setStartingOver] = React.useState(false);
  const [newTarget, setNewTarget] = React.useState<string | null>(null);
  const [byTarget, setByTarget] = React.useState<Record<string, GrowthPerformanceTotals> | null>(null);

  const run = React.useCallback(
    async (key: string, path: string, body?: unknown): Promise<boolean> => {
      setBusy(key);
      setError(null);
      const result = await callPilot(base, path, body);
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setData(result.data);
      return true;
    },
    [base],
  );

  const working = data ? data.pilot.status === 'analyzing' || growthPilotHasPendingWork(data) : false;
  // While there is work - the site being read, ads being made - ask the server to do the next unit of
  // it; each call does one, so the page keeps asking until nothing is left. When another caller holds
  // the work (another tab), or a call fails, it looks again a little later.
  React.useEffect(() => {
    if (!working) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const result = await callPilot(base, '/advance');
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else setError(result.error);
      const more = result.ok && result.data !== null && (result.data.pilot.status === 'analyzing' || growthPilotHasPendingWork(result.data));
      if (!result.ok || more) timer = setTimeout(() => void tick(), result.ok && result.data?.pilot.status !== 'analyzing' ? GROWTH_PILOT_STEP_MS : GROWTH_PILOT_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [working, base]);

  const start = async (url: string) => {
    if (await run('start', '', { siteUrl: url })) setStartingOver(false);
  };

  if (!data || startingOver) {
    return <StartScreen onStart={(url) => void start(url)} pending={busy === 'start'} error={error} onCancel={data ? () => setStartingOver(false) : undefined} />;
  }
  const host = siteHost(data.pilot.siteUrl);
  if (data.pilot.status === 'analyzing') return <AnalyzingCard host={host} error={error} />;
  if (data.pilot.status === 'failed') {
    return <FailedCard host={host} code={data.pilot.failureCode} pending={busy === 'start'} onRetry={() => void start(data.pilot.siteUrl)} onOther={() => setStartingOver(true)} />;
  }

  const waiting = waitingProposals(data.proposals);
  const targets = data.targets.filter((target) => target.status === 'active' || target.status === 'paused');
  const paused = data.pilot.status === 'paused';
  const analysis = data.pilot.analysis;

  return (
    <div className="flex flex-col gap-6" data-testid="growth-pilot-center">
      <header className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pp-primary to-pp-primary-container text-white">
            <Globe className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate font-pp-display text-2xl font-bold tracking-tight" dir="ltr">
              {host}
            </h1>
            <span className={cn('inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-semibold', paused ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success')} data-testid="growth-pilot-status">
              <span className={cn('h-1.5 w-1.5 rounded-full', paused ? 'bg-muted-foreground' : 'bg-success')} aria-hidden="true" />
              {t(paused ? 'header.paused' : 'header.active')}
            </span>
            <p className="text-xs text-muted-foreground" data-testid="growth-pilot-status-hint">
              {t(paused ? 'header.pausedHint' : 'header.activeHint')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy === 'pause'}
            onClick={() => void run('pause', '/pause', { paused: !paused })}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60"
            data-testid="growth-pilot-pause"
          >
            {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
            {t(paused ? 'header.resume' : 'header.pause')}
          </button>
          <button
            type="button"
            onClick={() => setNewTarget(newTarget === null ? '' : null)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow hover:bg-primary/90"
            aria-expanded={newTarget !== null}
            data-testid="growth-pilot-new-target"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('header.newTarget')}
          </button>
        </div>
      </header>

      <ErrorLine code={error} />

      {newTarget !== null ? (
        <form
          className="flex flex-col gap-3 rounded-3xl border border-primary/30 bg-primary/5 p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run('target', '/targets', { request: newTarget })) setNewTarget(null);
          }}
          data-testid="growth-pilot-new-target-form"
        >
          <div className="flex flex-col gap-1">
            <h2 className="font-pp-display text-base font-semibold">{t('newTarget.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('newTarget.hint')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={newTarget}
              onChange={(event) => setNewTarget(event.target.value)}
              placeholder={t('newTarget.placeholder')}
              dir="auto"
              aria-label={t('newTarget.title')}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-input bg-background px-3 text-sm"
            />
            <button type="submit" disabled={!newTarget.trim() || busy === 'target'} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {busy === 'target' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
              {t('newTarget.submit')}
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {data.targets.some((target) => target.publishStatus === 'published' || target.publishStatus === 'running') ? <GrowthPerformanceSection base={base} onTargets={setByTarget} /> : null}
          <section className="flex flex-col gap-3" aria-labelledby="growth-pilot-waiting">
            <h2 id="growth-pilot-waiting" className="flex items-center gap-2 font-pp-display text-xl font-semibold">
              {t('waiting.title')}
              {waiting.length ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{waiting.length}</span> : null}
            </h2>
            {waiting.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">{t(paused ? 'waiting.emptyPaused' : working ? 'waiting.emptyWorking' : 'waiting.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {waiting.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    busy={busy === proposal.id}
                    onDecide={(action, extra) => void run(proposal.id, `/proposals/${proposal.id}`, { action, ...extra })}
                    onRevise={(text) => void run(proposal.id, `/proposals/${proposal.id}`, { action: 'revise', request: text })}
                    studio={studio}
                    host={host}
                    metaConnectHref={metaConnectHref ?? null}
                    landing={proposal.landingPageId ? data.landingPages.find((page) => page.id === proposal.landingPageId) : null}
                    canExecute={canExecute}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="growth-pilot-targets">
            <h2 id="growth-pilot-targets" className="font-pp-display text-xl font-semibold">
              {t('targets.title')}
            </h2>
            {targets.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">{t('targets.empty')}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {targets.map((target) => (
                  <TargetCard key={target.id} target={target} results={byTarget?.[target.id] ?? null} metaConnectHref={metaConnectHref ?? null} landingSlug={data.landingPages.find((page) => page.id === target.landingPageId)?.slug ?? null} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {analysis ? (
            <section className="flex flex-col gap-2 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby="growth-pilot-summary">
              <h2 id="growth-pilot-summary" className="font-pp-display text-base font-semibold" dir="auto">
                {t('summary.title', { business: isolate(analysis.businessName || host) })}
              </h2>
              <p className="text-sm text-muted-foreground" dir="auto">
                {analysis.summary}
              </p>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium">{t('summary.pages', { count: data.pilot.pagesRead.length })}</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {data.pilot.pagesRead.map((page) => (
                    <li key={page.url} className="truncate" dir="ltr">
                      {page.url}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          ) : null}
          <ActivityFeed activity={data.activity} />
          <button type="button" onClick={() => setStartingOver(true)} className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
            {t('header.startOver')}
          </button>
        </aside>
      </div>
    </div>
  );
}
