'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Globe, Loader2, Sparkles } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

export interface AdFromSiteProps {
  orgId: string;
  projectId: string;
  /** The studio's base path; the new ad opens at `?brief=<id>&step=plan`. */
  studioHref: string;
  /** The site the project already advertises, when known. */
  defaultSiteUrl: string | null;
}

/** The engine's reason, as one of the few things a person can act on. */
export function fromSiteReason(reason: string | undefined): 'invalid_url' | 'nothing_found' | 'blocked' | 'unreachable' | 'unreadable' {
  if (reason === 'invalid_url' || reason === 'site_no_url') return 'invalid_url';
  if (reason === 'nothing_found') return 'nothing_found';
  if (reason === 'site_blocked_url') return 'blocked';
  if (reason === 'site_not_html' || reason === 'site_empty_page') return 'unreadable';
  return 'unreachable';
}

/**
 * The beginner's way to a new ad: type the website, nothing else. The AI reads the site, writes the
 * whole brief and starts preparing the ad; the person lands on the plan to confirm it.
 */
export function AdFromSite({ orgId, projectId, studioHref, defaultSiteUrl }: AdFromSiteProps): React.ReactElement {
  const t = useTranslations('AdStudio.fromSite');
  const router = useRouter();
  const errorMessage = useAdStudioErrorMessage();
  const [siteUrl, setSiteUrl] = React.useState(defaultSiteUrl ?? '');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!siteUrl.trim()) {
      setError(t('reasons.invalid_url'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/from-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: siteUrl.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as AdStudioApiError & { reason?: string; brief?: { id: string } };
      if (response.ok && body.brief) {
        router.push(`${studioHref}?brief=${body.brief.id}&step=plan`);
        return;
      }
      setError(body.error === 'site' ? t(`reasons.${fromSiteReason(body.reason)}`) : errorMessage(body));
      setPending(false);
    } catch {
      setError(errorMessage({}));
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4" data-testid="ad-studio-from-site" noValidate>
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('title')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('description')}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="ad-studio-from-site-url">
          {t('label')}
        </label>
        <div className="relative min-w-0 flex-1">
          <Globe className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="ad-studio-from-site-url"
            type="url"
            inputMode="url"
            dir="ltr"
            value={siteUrl}
            onChange={(event) => setSiteUrl(event.target.value)}
            placeholder="example.com"
            disabled={pending}
            className="h-11 w-full rounded-xl border border-input bg-background ps-9 pe-3 text-sm"
          />
        </div>
        <button type="submit" disabled={pending} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid="ad-studio-from-site-submit">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
          {t('submit')}
        </button>
      </div>
      {pending ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t('working')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
