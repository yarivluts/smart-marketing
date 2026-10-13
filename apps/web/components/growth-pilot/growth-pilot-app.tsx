'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { siteHost } from '@growthos/shared';
import { AlertTriangle, ArrowLeft, Check, Globe, Loader2, Megaphone, Package, Pause, Play, Plus, ShieldCheck, Sparkles, Target, Users, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { waitingProposals, type GrowthActivityView, type GrowthPilotPageData, type GrowthProposalView, type GrowthTargetView } from '@/lib/growth-pilot/view';
import { useLocalDateTime } from '@/components/ad-studio/use-local-date-time';

const KIND_ICON = { product: Package, service: Megaphone, audience: Users } as const;
const SHORT = { dateStyle: 'short', timeStyle: 'short' } as const;
/** While the site is read in another tab or request, how often this page looks again. */
export const GROWTH_PILOT_POLL_MS = 5000;

type ApiResult = { ok: true; data: GrowthPilotPageData | null } | { ok: false; error: string };

/** Calls a Growth Pilot route and returns the page data it answers with, or the error code. */
async function callPilot(base: string, path: string, body?: unknown): Promise<ApiResult> {
  try {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const json = (await response.json().catch(() => ({}))) as GrowthPilotPageData & { error?: string; pilot: unknown };
    if (!response.ok) return { ok: false, error: typeof json.error === 'string' ? json.error : 'generic' };
    return { ok: true, data: json.pilot ? json : null };
  } catch {
    return { ok: false, error: 'generic' };
  }
}

function failureKey(code: string | null): 'site' | 'quota_exceeded' | 'nothing_found' | 'provider' {
  if (!code) return 'provider';
  if (code.startsWith('site_')) return 'site';
  if (code === 'quota_exceeded' || code === 'nothing_found') return code;
  return 'provider';
}

function ErrorLine({ code }: { code: string | null }): React.ReactElement | null {
  const t = useTranslations('GrowthPilot.errors');
  if (!code) return null;
  const known = ['invalid_site', 'empty_request', 'quota_exceeded', 'provider_failed', 'not_pending', 'not_ready', 'not_found'].includes(code);
  return (
    <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
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
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t('placeholder')}
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
      <ErrorLine code={error} />
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
function AnalyzingCard({ host }: { host: string }): React.ReactElement {
  const t = useTranslations('GrowthPilot.analyzing');
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-soft" aria-busy="true" data-testid="growth-pilot-analyzing">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="font-pp-display text-lg font-semibold" role="status">
            {t('title', { host })}
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
    </section>
  );
}

function FailedCard({ host, code, onRetry, onOther, pending }: { host: string; code: string | null; onRetry: () => void; onOther: () => void; pending: boolean }): React.ReactElement {
  const t = useTranslations('GrowthPilot');
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-3xl border border-warning/40 bg-card p-6 shadow-soft" data-testid="growth-pilot-failed">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="font-pp-display text-lg font-semibold">{t('failed.title', { host })}</h2>
          <p className="text-sm text-muted-foreground">{t(`failure.${failureKey(code)}`)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {t('failed.retry')}
        </button>
        <button type="button" onClick={onOther} className="inline-flex h-10 items-center rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted">
          {t('failed.other')}
        </button>
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
function ProposalCard({ proposal, busy, onDecide, onRevise }: { proposal: GrowthProposalView; busy: boolean; onDecide: (action: 'approve' | 'reject') => void; onRevise: (text: string) => void }): React.ReactElement | null {
  const t = useTranslations('GrowthPilot.waiting');
  const [changing, setChanging] = React.useState(false);
  const [text, setText] = React.useState('');
  const draft = proposal.draft;
  const revising = proposal.status === 'revising';
  const last = proposal.changes.at(-1);
  if (!draft) return null;
  return (
    <li className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" data-testid="growth-pilot-proposal" aria-busy={revising || busy}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {React.createElement(KIND_ICON[draft.kind], { className: 'h-5 w-5', 'aria-hidden': true })}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-pp-display text-base font-semibold" dir="auto">
              {draft.name}
            </h3>
            <KindChip kind={draft.kind} />
          </div>
          {draft.description ? (
            <p className="text-sm text-muted-foreground" dir="auto">
              {draft.description}
            </p>
          ) : null}
          {draft.audience ? (
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
      {last ? (
        <p className={cn('rounded-xl px-3 py-2 text-xs', last.outcome === 'failed' ? 'bg-warning/10 text-warning' : 'bg-muted/60 text-muted-foreground')} dir="auto">
          {last.outcome === 'failed' ? t('changeFailed', { reason: last.failureCode ?? '' }) : t('asked', { text: last.text })}
        </p>
      ) : null}
      {revising ? (
        <p className="flex items-center gap-2 text-sm font-medium text-primary" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('revising')}
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
            placeholder={t('changePlaceholder')}
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
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => onDecide('approve')} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid="growth-pilot-approve">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {t('approve')}
          </button>
          <button type="button" disabled={busy} onClick={() => setChanging(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-4 text-sm font-semibold text-primary disabled:opacity-60" data-testid="growth-pilot-change">
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            {t('change')}
          </button>
          <button type="button" disabled={busy} onClick={() => onDecide('reject')} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60" data-testid="growth-pilot-reject">
            <X className="h-4 w-4" aria-hidden="true" />
            {t('reject')}
          </button>
        </div>
      )}
    </li>
  );
}

function TargetCard({ target }: { target: GrowthTargetView }): React.ReactElement {
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
      <p className="mt-auto border-t border-border/60 pt-2 text-xs text-muted-foreground">{t('next')}</p>
    </li>
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
}

/**
 * Growth Pilot, the one-input marketing autopilot: the person enters their website, the AI reads it
 * and proposes what to grow, and every proposal waits for the person - approve, reject, or ask the AI
 * for a change. The person can pause the pilot or ask for more targets at any time.
 */
export function GrowthPilotApp({ orgId, projectId, initial }: GrowthPilotAppProps): React.ReactElement {
  const t = useTranslations('GrowthPilot');
  const base = `/api/orgs/${orgId}/projects/${projectId}/growth-pilot`;
  const [data, setData] = React.useState<GrowthPilotPageData | null>(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [startingOver, setStartingOver] = React.useState(false);
  const [newTarget, setNewTarget] = React.useState<string | null>(null);

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

  const status = data?.pilot.status;
  // While the site is read: ask the server to do it (or, when another caller is on it, look again shortly).
  React.useEffect(() => {
    if (status !== 'analyzing') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const result = await callPilot(base, '/advance');
      if (cancelled) return;
      if (result.ok) setData(result.data);
      else setError(result.error);
      if (!result.ok || result.data?.pilot.status === 'analyzing') timer = setTimeout(() => void tick(), GROWTH_PILOT_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, base]);

  const start = async (url: string) => {
    if (await run('start', '', { siteUrl: url })) setStartingOver(false);
  };

  if (!data || startingOver) {
    return <StartScreen onStart={(url) => void start(url)} pending={busy === 'start'} error={error} onCancel={data ? () => setStartingOver(false) : undefined} />;
  }
  const host = siteHost(data.pilot.siteUrl);
  if (data.pilot.status === 'analyzing') return <AnalyzingCard host={host} />;
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
          <section className="flex flex-col gap-3" aria-labelledby="growth-pilot-waiting">
            <h2 id="growth-pilot-waiting" className="flex items-center gap-2 font-pp-display text-xl font-semibold">
              {t('waiting.title')}
              {waiting.length ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{waiting.length}</span> : null}
            </h2>
            {waiting.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">{t('waiting.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {waiting.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    busy={busy === proposal.id}
                    onDecide={(action) => void run(proposal.id, `/proposals/${proposal.id}`, { action })}
                    onRevise={(text) => void run(proposal.id, `/proposals/${proposal.id}`, { action: 'revise', request: text })}
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
                  <TargetCard key={target.id} target={target} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {analysis ? (
            <section className="flex flex-col gap-2 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby="growth-pilot-summary">
              <h2 id="growth-pilot-summary" className="font-pp-display text-base font-semibold" dir="auto">
                {t('summary.title', { business: analysis.businessName || host })}
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
