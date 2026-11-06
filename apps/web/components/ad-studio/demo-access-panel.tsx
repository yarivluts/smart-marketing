'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clapperboard, KeyRound, Loader2 } from 'lucide-react';
import {
  AD_STUDIO_DEMO_FAILURE_CODES,
  AD_STUDIO_DEMO_LIMITS,
  AD_STUDIO_DEMO_MAX_STEPS,
  type AdStudioDemoAccessView,
  type AdStudioDemoRecordingView,
} from '@growthos/shared';
import { useRouter } from '@/i18n/navigation';

const inputClass = 'rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground';
const FIELD_CODES = ['login_url', 'username', 'password', 'notes'] as const;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * The product demo: asks, in plain words, for a trial account of the customer's web app, records a
 * short usage video with it, and lets people pick which moments their video ads show. The trial
 * access is edited with `project.configure` (the password is write-only: it is never sent back);
 * anyone who can use the studio records and picks moments.
 */
export function DemoAccessPanel({
  orgId,
  projectId,
  access,
  canEdit,
  recordings,
  recordingAvailable,
}: {
  orgId: string;
  projectId: string;
  /** Null without trial access. For people who cannot edit it, the username is left out. */
  access: AdStudioDemoAccessView | null;
  canEdit: boolean;
  /** Newest first. */
  recordings: AdStudioDemoRecordingView[];
  /** A text model and the vault are configured. */
  recordingAvailable: boolean;
}): React.ReactElement {
  const t = useTranslations('AdStudio.demo');
  const locale = useLocale();
  const router = useRouter();
  const base = `/api/orgs/${orgId}/projects/${projectId}/ad-studio`;
  const [form, setForm] = React.useState({ loginUrl: access?.loginUrl ?? '', username: access?.username ?? '', password: '', notes: access?.notes ?? '' });
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [recording, setRecording] = React.useState(false);
  const [recordMessage, setRecordMessage] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<AdStudioDemoRecordingView[]>(recordings);
  // The newest attempt says how the last recording went; ads use the newest ready one.
  const newest = rows[0] ?? null;
  const latest = rows.find((row) => row.status === 'ready') ?? null;
  const replace = (next: AdStudioDemoRecordingView) => setRows((current) => [next, ...current.filter((row) => row.id !== next.id)].sort((a, b) => b.requestedOn.localeCompare(a.requestedOn)));
  const [selectionNote, setSelectionNote] = React.useState<string | null>(null);

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${base}/demo-access`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demoAccess: form }) });
      const body = (await response.json().catch(() => ({}))) as { fields?: string[]; code?: string };
      if (!response.ok) {
        const fields = (body.fields ?? []).filter((field): field is (typeof FIELD_CODES)[number] => (FIELD_CODES as readonly string[]).includes(field));
        setMessage({ tone: 'error', text: fields.length ? fields.map((field) => t(`field.${field}`)).join(' ') : body.code === 'vault_not_configured' ? t('vaultMissing') : t('saveFailed') });
        return;
      }
      // The password is never kept in the page once saved.
      setForm((current) => ({ ...current, password: '' }));
      setMessage({ tone: 'ok', text: t('saved') });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: t('saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${base}/demo-access`, { method: 'DELETE' });
      if (!response.ok) {
        setMessage({ tone: 'error', text: t('saveFailed') });
        return;
      }
      setForm({ loginUrl: '', username: '', password: '', notes: '' });
      setMessage({ tone: 'ok', text: t('removed') });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: t('saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function record(): Promise<void> {
    setRecording(true);
    setRecordMessage(null);
    try {
      const response = await fetch(`${base}/demo-recordings`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as { recording?: AdStudioDemoRecordingView; error?: string; code?: string };
      if (body.recording) {
        replace(body.recording);
        router.refresh();
        return;
      }
      if (body.error === 'quota_exceeded') setRecordMessage(t('error.quota_exceeded'));
      else if (body.code === 'no_demo_access' || body.code === 'already_recording') setRecordMessage(t(`error.${body.code}`));
      else if (body.code === 'vault_not_configured' || body.code === 'not_configured') setRecordMessage(t('error.not_set_up'));
      else setRecordMessage(t('error.generic'));
    } catch {
      setRecordMessage(t('error.generic'));
    } finally {
      setRecording(false);
    }
  }

  async function toggle(segmentId: string, selected: boolean): Promise<void> {
    if (!latest) return;
    const ids = latest.segments.filter((segment) => (segment.id === segmentId ? selected : segment.selected)).map((segment) => segment.id);
    setSelectionNote(null);
    const response = await fetch(`${base}/demo-recordings/${latest.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedSegmentIds: ids }) }).catch(() => null);
    const body = (await response?.json().catch(() => ({}))) as { recording?: AdStudioDemoRecordingView } | undefined;
    if (response?.ok && body?.recording) {
      replace(body.recording);
      setSelectionNote(t('selectionSaved'));
    } else {
      setSelectionNote(t('saveFailed'));
    }
  }

  const failure = newest?.status === 'failed' ? ((AD_STUDIO_DEMO_FAILURE_CODES as readonly string[]).includes(newest.failureCode ?? '') ? newest.failureCode! : 'unknown') : null;
  const canRecord = Boolean(access) && recordingAvailable && !recording;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="ad-studio-demo-heading" data-testid="ad-studio-demo">
      <header className="flex items-start gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Clapperboard className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id="ad-studio-demo-heading" className="text-base font-semibold">
            {t('title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('accessTitle')}
        </h3>
        <p className="text-sm">{t('askAccess')}</p>
        <ul className="list-disc space-y-1 ps-5 text-xs text-muted-foreground">
          <li>{t('point1')}</li>
          <li>{t('point2')}</li>
          <li>{t('point3')}</li>
        </ul>

        {canEdit ? (
          <form onSubmit={save} className="mt-2 grid gap-3 md:grid-cols-2" autoComplete="off" data-testid="ad-studio-demo-form">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('loginUrl')}
              <input type="url" required value={form.loginUrl} onChange={(event) => setForm({ ...form, loginUrl: event.target.value })} maxLength={AD_STUDIO_DEMO_LIMITS.loginUrl} placeholder={t('loginUrlPlaceholder')} dir="ltr" autoComplete="off" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('username')}
              <input value={form.username} required onChange={(event) => setForm({ ...form, username: event.target.value })} maxLength={AD_STUDIO_DEMO_LIMITS.username} dir="ltr" autoComplete="off" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('password')}
              <input
                type="password"
                value={form.password}
                required={!access?.hasPassword}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                maxLength={AD_STUDIO_DEMO_LIMITS.password}
                placeholder={access?.hasPassword ? t('passwordKeep') : ''}
                dir="ltr"
                autoComplete="new-password"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground md:col-span-2">
              {t('notes')}
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={AD_STUDIO_DEMO_LIMITS.notes} rows={2} dir="auto" placeholder={t('notesPlaceholder')} className={inputClass} />
            </label>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {t('save')}
              </button>
              {access ? (
                <button type="button" onClick={() => void remove()} disabled={saving} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
                  {t('remove')}
                </button>
              ) : null}
              {message ? (
                <span role="status" className={message.tone === 'ok' ? 'text-sm text-success' : 'text-sm text-destructive'}>
                  {message.text}
                </span>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground" data-testid="ad-studio-demo-readonly">
            <span className="font-medium text-foreground">{access ? t('configuredFor', { host: hostOf(access.loginUrl) }) : t('notConfigured')}</span>
            <span>{t('readOnly')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">{t('recordTitle')}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void record()} disabled={!canRecord} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid="ad-studio-demo-record">
            {recording ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {newest ? t('recordAgain') : t('record')}
          </button>
          <span className="text-xs text-muted-foreground">{recording ? t('recording') : !access ? t('needsAccess') : !recordingAvailable ? t('unavailable') : t('recordCost', { calls: AD_STUDIO_DEMO_MAX_STEPS + 1 })}</span>
        </div>
        {recordMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {recordMessage}
          </p>
        ) : null}

        {newest?.status === 'recording' ? <p className="text-sm text-muted-foreground">{t('statusRecording')}</p> : null}
        {failure ? (
          <p className="text-sm text-destructive" data-testid="ad-studio-demo-failed">
            {t('failed', { reason: t(`failure.${failure}`) })}
          </p>
        ) : null}
        {latest ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t('recordedOn', { date: new Date(latest.completedOn ?? latest.requestedOn).toLocaleString(locale) })}</span>
              <video controls preload="metadata" className="w-full rounded-lg border border-border bg-black" src={`${base}/demo-recordings/${latest.id}/media`} aria-label={t('latest')} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t('moments')}</span>
              <span className="text-xs text-muted-foreground">{t('momentsHint')}</span>
              <ul className="flex flex-col gap-2" aria-label={t('moments')}>
                {latest.segments.map((segment) => (
                  <li key={segment.id} className="rounded-lg border border-border p-2">
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={segment.selected} onChange={(event) => void toggle(segment.id, event.target.checked)} className="mt-1" aria-label={`${t('useInAds')}: ${segment.title}`} />
                      <span className="flex flex-col">
                        <span className="font-medium" dir="auto">
                          {segment.title}
                        </span>
                        <span className="text-xs text-muted-foreground" dir="auto">
                          {segment.description}
                        </span>
                        <span className="text-xs text-muted-foreground">{t('momentRange', { start: Math.round(segment.startSeconds), end: Math.round(segment.endSeconds) })}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {selectionNote ? (
                <span role="status" className="text-xs text-muted-foreground">
                  {selectionNote}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
