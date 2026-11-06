'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Copy, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShareDate } from '@/lib/ad-studio/share-view';

/** A share link as the API lists it (never its token). */
export interface ShareLinkRow {
  id: string;
  briefIds: string[] | null;
  label: string;
  createdOn: string;
  expiresOn: string;
  revokedOn: string | null;
  status: 'active' | 'expired' | 'revoked';
}

const EXPIRY_DAYS = [7, 30, 90] as const;
const ALL = '__all__';

export interface ShareLinksPanelProps {
  orgId: string;
  projectId: string;
  /** The ads a link can be limited to. */
  briefs: { id: string; name: string }[];
  initialLinks: ShareLinkRow[];
  /** Preselects one ad (the per-ad shortcut); otherwise "all ads". */
  defaultBriefId?: string;
}

/** The address a client opens; built in the browser so it follows whatever host the person is on. */
export function shareUrl(origin: string, locale: string, token: string): string {
  return `${origin}/${locale}/share/ads/${token}`;
}

/**
 * "Share with client" (project.configure): makes a read-only, sign-in-free link to the project's
 * ads - all of them or one - for 7, 30 or 90 days, shows it once to copy, and lists every link
 * made so far with a way to turn it off.
 */
export function ShareLinksPanel({ orgId, projectId, briefs, initialLinks, defaultBriefId }: ShareLinksPanelProps): React.ReactElement {
  const t = useTranslations('AdShare.manage');
  const locale = useLocale();
  const api = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/share-links`;
  const [links, setLinks] = React.useState(initialLinks);
  const [scope, setScope] = React.useState(defaultBriefId ?? ALL);
  const [label, setLabel] = React.useState('');
  const [days, setDays] = React.useState<(typeof EXPIRY_DAYS)[number]>(30);
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [created, setCreated] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const briefName = new Map(briefs.map((brief) => [brief.id, brief.name]));
  const date = (iso: string) => formatShareDate(locale, iso);

  async function create(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setFailed(false);
    setCopied(false);
    try {
      const response = await fetch(api, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ briefIds: scope === ALL ? null : [scope], label, expiresInDays: days }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { token: string; link: ShareLinkRow };
      setLinks((current) => [body.link, ...current]);
      setCreated(shareUrl(window.location.origin, locale, body.token));
      setLabel('');
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  async function copy(): Promise<void> {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      // The address stays selectable in the field for a manual copy.
    }
  }

  async function revoke(id: string): Promise<void> {
    setFailed(false);
    try {
      const response = await fetch(`${api}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { link: ShareLinkRow };
      setLinks((current) => current.map((link) => (link.id === id ? body.link : link)));
    } catch {
      setFailed(true);
    } finally {
      setConfirming(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="ad-share-heading" data-testid="ad-share-panel">
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id="ad-share-heading" className="text-base font-semibold">
            {t('title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('intro')}</p>
        </div>
      </div>

      <form onSubmit={create} className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t('scopeLabel')}
          <select value={scope} onChange={(event) => setScope(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm">
            <option value={ALL}>{t('allAds')}</option>
            {briefs.map((brief) => (
              <option key={brief.id} value={brief.id}>
                {brief.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t('labelLabel')}
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={80}
            placeholder={t('labelPlaceholder')}
            className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          {t('expiryLabel')}
          <select value={days} onChange={(event) => setDays(Number(event.target.value) as (typeof EXPIRY_DAYS)[number])} className="h-10 rounded-lg border border-border bg-background px-2 text-sm">
            {EXPIRY_DAYS.map((option) => (
              <option key={option} value={option}>
                {t('expiryDays', { days: option })}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-3">
          <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {pending ? t('creating') : t('create')}
          </button>
        </div>
      </form>

      {created ? (
        <div className="flex flex-col gap-2 rounded-xl border border-success/40 bg-success/5 p-3" data-testid="ad-share-created">
          <p className="text-xs font-medium">{t('createdNote')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={created} dir="ltr" aria-label={t('linkLabel')} onFocus={(event) => event.target.select()} className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm" />
            <button type="button" onClick={copy} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-primary/30 px-4 text-sm font-semibold text-primary">
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>
      ) : null}

      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          {t('error')}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('listTitle')}</h3>
        {links.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="ad-share-link-row">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium" dir="auto">
                    {link.label || t('noLabel')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {link.briefIds === null
                      ? t('allAds')
                      : link.briefIds.length === 1
                        ? (briefName.get(link.briefIds[0]) ?? t('adCount', { count: 1 }))
                        : t('adCount', { count: link.briefIds.length })}
                    {' · '}
                    {link.status === 'revoked' && link.revokedOn ? t('revokedOn', { date: date(link.revokedOn) }) : t('expiresOn', { date: date(link.expiresOn) })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      link.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {t(`status.${link.status}`)}
                  </span>
                  {link.status === 'active' ? (
                    confirming === link.id ? (
                      <span className="flex items-center gap-1.5" role="alertdialog" aria-label={t('revokeConfirm')}>
                        <span className="text-xs">{t('revokeConfirm')}</span>
                        <button type="button" autoFocus onClick={() => revoke(link.id)} className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground">
                          {t('revoke')}
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border border-border px-2.5 py-1 text-xs">
                          {t('cancel')}
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirming(link.id)} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-muted">
                        {t('revoke')}
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
