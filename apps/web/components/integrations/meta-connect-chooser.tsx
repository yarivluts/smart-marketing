'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Option {
  id: string;
  name: string;
}

export interface MetaConnectChooserProps {
  locale: string;
  orgId: string;
  session: string;
  adAccounts: { id: string; name: string; currency: string | null; status: number | null }[];
  pages: Option[];
  projects: Option[];
  defaultProjectId: string | null;
  returnTo: string | null;
  tokenExpiresOn: string | null;
}

const ERRORS = new Set(['invalid_choice', 'session_not_found', 'session_expired', 'wrong_user', 'not_authorized', 'project_not_found']);

/**
 * After Meta's consent: pick the ad account and the Page the ads run as, and the project the
 * connection serves. Saving creates (or refreshes) the Meta Ads credential and returns the person to
 * where they started, e.g. the Ad Studio's Publish step.
 */
export function MetaConnectChooser(props: MetaConnectChooserProps): React.ReactElement {
  const t = useTranslations('MetaConnect');
  const [adAccountId, setAdAccountId] = React.useState(props.adAccounts.find((account) => account.status === 1)?.id ?? props.adAccounts[0]?.id ?? '');
  const [pageId, setPageId] = React.useState(props.pages[0]?.id ?? '');
  const [projectId, setProjectId] = React.useState(props.defaultProjectId ?? '');
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string; href?: string } | null>(null);

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/orgs/${props.orgId}/integrations/meta/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: props.session, adAccountId, pageId, projectId }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; returnTo?: string | null };
      if (!response.ok) {
        setMessage({ tone: 'error', text: t(`errors.${body.error && ERRORS.has(body.error) ? body.error : 'exchange_failed'}`) });
        return;
      }
      if (body.returnTo) {
        window.location.assign(body.returnTo);
        return;
      }
      setMessage({ tone: 'ok', text: t('connected'), href: projectId ? `/${props.locale}/orgs/${props.orgId}/projects/${projectId}/resources` : undefined });
    } finally {
      setPending(false);
    }
  }

  const choice = 'flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm';
  return (
    <form className="flex flex-col gap-5" onSubmit={(event) => void save(event)} data-testid="meta-connect-chooser">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t('adAccount')}</legend>
        {props.adAccounts.map((account) => (
          <label key={account.id} className={cn(choice, adAccountId === account.id ? 'border-primary ring-2 ring-primary/30' : 'border-border')}>
            <span className="flex items-center gap-3">
              <input type="radio" name="meta-ad-account" value={account.id} checked={adAccountId === account.id} onChange={() => setAdAccountId(account.id)} />
              <span dir="auto" className="font-medium">
                {account.name}
              </span>
              <span className="text-xs text-muted-foreground" dir="ltr">
                act_{account.id}
                {account.currency ? ` · ${account.currency}` : ''}
              </span>
            </span>
            {account.status !== 1 ? <span className="text-xs text-warning">{t('accountInactive')}</span> : null}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t('page')}</legend>
        {props.pages.length === 0 ? <p className="text-sm text-muted-foreground">{t('noPages')}</p> : null}
        {props.pages.map((page) => (
          <label key={page.id} className={cn(choice, pageId === page.id ? 'border-primary ring-2 ring-primary/30' : 'border-border')}>
            <span className="flex items-center gap-3">
              <input type="radio" name="meta-page" value={page.id} checked={pageId === page.id} onChange={() => setPageId(page.id)} />
              <span dir="auto" className="font-medium">
                {page.name}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('project')}
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal">
          <option value="">{t('noProject')}</option>
          {props.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-muted-foreground">
        {props.tokenExpiresOn ? t('expiresNote', { date: new Date(props.tokenExpiresOn).toLocaleDateString() }) : t('noExpiryNote')} {t('manageNote')}
      </p>
      <div>
        <button
          type="submit"
          disabled={pending || !adAccountId || !pageId}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          {t('save')}
        </button>
      </div>
      {message ? (
        <p role="status" className={cn('text-sm', message.tone === 'ok' ? 'text-success' : 'text-destructive')}>
          {message.text}
          {message.href ? (
            <>
              {' '}
              <a href={message.href} className="font-medium underline">
                {t('openResources')}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
