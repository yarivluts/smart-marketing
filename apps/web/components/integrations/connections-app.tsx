'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, ExternalLink, Link2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CONNECTION_FIELDS, CONNECTION_GUIDE_LINKS, CONNECTION_PLATFORMS, type ConnectionPlatform } from '@/lib/integrations/connection-fields';
import type { ConnectionView } from '@/lib/integrations/connections';
import { useLocalDateTime } from '@/components/ad-studio/use-local-date-time';

export interface ConnectionRow extends ConnectionView {
  /** The projects this connection is attached to. */
  projects: string[];
}

export interface ConnectionsAppProps {
  orgId: string;
  canManage: boolean;
  projects: { id: string; name: string }[];
  connections: ConnectionRow[];
  /** The project a link sent the person here for: new connections attach to it. */
  initialProjectId: string | null;
  /** Where to go back to once connected (a page inside this org). */
  returnTo: string | null;
  /** "Connect with Facebook", when a Meta app is configured and the viewer may connect accounts. */
  metaConnectHref: string | null;
  /** The platform a link asked for: its card opens on arrival. */
  focus: ConnectionPlatform | null;
}

type Result = { tone: 'ok' | 'error'; text: string };

const WHEN = { dateStyle: 'medium', timeStyle: 'short' } as const;

const KNOWN_REASONS = new Set(['invalid_details', 'auth_failed', 'developer_token_not_approved', 'account_not_found', 'permission_denied', 'account_disabled', 'page_not_accessible', 'rate_limited', 'api_error']);

function StatusBadge({ status }: { status: string | null }): React.ReactElement {
  const t = useTranslations('Connections');
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t('status.ok')}
      </span>
    );
  }
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
        <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
        {t('status.unchecked')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      {t('status.failed')}
    </span>
  );
}

/**
 * Every ad platform an organization can connect - Facebook & Instagram (Meta), Google Ads and
 * TikTok - on one page: what is connected, whether it still works (checked against the platform),
 * which projects use it, and a guided way to add an account: the steps to get each detail, one
 * field per detail, and "Save and check", which saves only a connection the platform accepts.
 */
export function ConnectionsApp({ orgId, canManage, projects, connections: initial, initialProjectId, returnTo, metaConnectHref, focus }: ConnectionsAppProps): React.ReactElement {
  const t = useTranslations('Connections');
  const [connections, setConnections] = React.useState(initial);
  React.useEffect(() => setConnections(initial), [initial]);
  return (
    <div className="flex flex-col gap-5" data-testid="connections">
      {!canManage ? (
        <p role="note" className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
          {t('readOnly')}
        </p>
      ) : null}
      {CONNECTION_PLATFORMS.map((platform) => (
        <PlatformCard
          key={platform}
          orgId={orgId}
          platform={platform}
          canManage={canManage}
          projects={projects}
          rows={connections.filter((row) => row.provider === platform)}
          initialProjectId={initialProjectId}
          returnTo={returnTo}
          metaConnectHref={platform === 'meta_ads' ? metaConnectHref : null}
          openOnArrival={focus === platform}
          onSaved={(row) =>
            // A known connection updates where it is; a new one goes first.
            setConnections((current) => (current.some((entry) => entry.id === row.id) ? current.map((entry) => (entry.id === row.id ? row : entry)) : [row, ...current]))
          }
        />
      ))}
    </div>
  );
}

function PlatformCard(props: {
  orgId: string;
  platform: ConnectionPlatform;
  canManage: boolean;
  projects: { id: string; name: string }[];
  rows: ConnectionRow[];
  initialProjectId: string | null;
  returnTo: string | null;
  metaConnectHref: string | null;
  openOnArrival: boolean;
  onSaved: (row: ConnectionRow) => void;
}): React.ReactElement {
  const { orgId, platform, canManage, projects, rows, initialProjectId, returnTo, metaConnectHref, openOnArrival, onSaved } = props;
  const t = useTranslations('Connections');
  const router = useRouter();
  // Formatted in the browser only: the server's UTC text would not match the viewer's (hydration).
  const when = useLocalDateTime(WHEN);
  const [adding, setAdding] = React.useState(openOnArrival);
  const [manual, setManual] = React.useState(platform !== 'meta_ads' || !metaConnectHref);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [projectId, setProjectId] = React.useState(initialProjectId ?? '');
  const [invalid, setInvalid] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [rowResults, setRowResults] = React.useState<Record<string, Result>>({});
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name ?? '';
  const reasonText = (reason: string) => t(`reasons.${KNOWN_REASONS.has(reason) ? reason : 'api_error'}`);
  const accountLabel = (row: Pick<ConnectionRow, 'accountName' | 'accountId' | 'name'>) => row.accountName ? `${row.accountName}${row.accountId ? ` (${row.accountId})` : ''}` : row.name;

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending('save');
    setResult(null);
    setInvalid([]);
    try {
      const response = await fetch(`/api/orgs/${orgId}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: platform, fields: values, projectId: projectId || null }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; fields?: string[]; check?: { status: string; reason?: string }; connection?: ConnectionView | null };
      if (response.status === 400 && body.error === 'invalid_details') {
        setInvalid(body.fields ?? []);
        setResult({ tone: 'error', text: t('fixFields') });
        return;
      }
      if (!response.ok || !body.check) {
        setResult({ tone: 'error', text: body.error === 'vault_not_configured' ? t('reasons.vault_not_configured') : t('reasons.api_error') });
        return;
      }
      if (body.check.status !== 'ok' || !body.connection) {
        setResult({ tone: 'error', text: reasonText(body.check.reason ?? 'api_error') });
        return;
      }
      const attached = projectId ? [projectName(projectId)] : [];
      const previous = rows.find((row) => row.id === body.connection!.id);
      onSaved({ ...body.connection, projects: [...new Set([...(previous?.projects ?? []), ...attached])] });
      setValues({});
      setAdding(false);
      setResult({ tone: 'ok', text: t('connected', { account: accountLabel(body.connection) }) });
      router.refresh();
    } catch {
      setResult({ tone: 'error', text: t('reasons.api_error') });
    } finally {
      setPending(null);
    }
  }

  async function recheck(row: ConnectionRow): Promise<void> {
    setPending(row.id);
    try {
      const response = await fetch(`/api/orgs/${orgId}/connections/${row.id}/check`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as { check?: { status: string; reason?: string }; connection?: ConnectionView };
      if (!response.ok || !body.check || !body.connection) {
        setRowResults((current) => ({ ...current, [row.id]: { tone: 'error', text: t('reasons.api_error') } }));
        return;
      }
      onSaved({ ...body.connection, projects: row.projects });
      setRowResults((current) => ({ ...current, [row.id]: body.check!.status === 'ok' ? { tone: 'ok', text: t('stillWorks') } : { tone: 'error', text: reasonText(body.check!.reason ?? 'api_error') } }));
    } catch {
      setRowResults((current) => ({ ...current, [row.id]: { tone: 'error', text: t('reasons.api_error') } }));
    } finally {
      setPending(null);
    }
  }

  const steps = CONNECTION_GUIDE_LINKS[platform];
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-soft" aria-labelledby={`connections-${platform}`} data-testid={`connections-${platform}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`connections-${platform}`} className="text-lg font-semibold">
            {t(`platforms.${platform}.name`)}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t(`platforms.${platform}.why`)}</p>
        </div>
        {canManage && !adding ? (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm font-semibold hover:bg-muted" data-testid={`connections-${platform}-add`}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {rows.length ? t('addAnother') : t('connect')}
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('none')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-border/60" data-testid={`connections-${platform}-rows`}>
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-medium" dir="auto">
                    {accountLabel(row)}
                  </span>
                  <StatusBadge status={row.lastCheckStatus} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {row.lastCheckStatus && row.lastCheckStatus !== 'ok' ? `${reasonText(row.lastCheckStatus)} ` : ''}
                  {row.lastCheckedOn ? t('checkedOn', { when: when(row.lastCheckedOn) }) : t('neverChecked')}
                </span>
                <span className="text-xs text-muted-foreground" dir="auto">
                  {row.projects.length ? t('usedIn', { projects: row.projects.join(', ') }) : t('notInProject')}
                </span>
                {rowResults[row.id] ? (
                  <span role={rowResults[row.id]!.tone === 'error' ? 'alert' : 'status'} className={cn('text-xs', rowResults[row.id]!.tone === 'error' ? 'text-destructive' : 'text-success')}>
                    {rowResults[row.id]!.text}
                  </span>
                ) : null}
              </div>
              {canManage ? (
                <button type="button" onClick={() => void recheck(row)} disabled={pending !== null} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-60 sm:self-center">
                  {pending === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                  {t('checkAgain')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {result ? (
        <div role={result.tone === 'error' ? 'alert' : 'status'} className={cn('flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 text-sm', result.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
          {result.text}
          {result.tone === 'ok' && returnTo ? (
            <a href={returnTo} className="font-semibold underline" data-testid="connections-return">
              {t('backToWork')}
            </a>
          ) : null}
        </div>
      ) : null}

      {canManage && adding ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4" data-testid={`connections-${platform}-form`}>
          {platform === 'meta_ads' && metaConnectHref ? (
            <div className="flex flex-col gap-2">
              <a href={metaConnectHref} className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#166fe0]" data-testid="connections-meta-oauth">
                <Link2 className="h-4 w-4" aria-hidden="true" />
                {t('platforms.meta_ads.oauth')}
              </a>
              <p className="text-xs text-muted-foreground">{t('platforms.meta_ads.oauthHint')}</p>
              <button type="button" onClick={() => setManual((open) => !open)} aria-expanded={manual} className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-primary">
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', manual && 'rotate-180')} aria-hidden="true" />
                {t('platforms.meta_ads.manual')}
              </button>
            </div>
          ) : null}
          {manual ? (
            <>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t('guideTitle')}</h3>
                <ol className="flex list-decimal flex-col gap-2 ps-5 text-sm">
                  {steps.map((href, index) => (
                    <li key={index}>
                      {t(`platforms.${platform}.steps.${index + 1}`)}
                      {href ? (
                        <>
                          {' '}
                          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">
                            {t('open')}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {platform === 'tiktok_ads' ? <p className="text-xs text-muted-foreground">{t('platforms.tiktok_ads.note')}</p> : null}
              </div>
              <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3" noValidate>
                <div className="grid gap-3 sm:grid-cols-2">
                  {CONNECTION_FIELDS[platform].map((spec) => {
                    const id = `connections-${platform}-${spec.name}`;
                    const wrong = invalid.includes(spec.name);
                    return (
                      <div key={spec.name} className="flex min-w-0 flex-col gap-1 text-xs font-medium">
                        <label htmlFor={id}>
                          {t(`fields.${spec.name}.label`)}
                          {spec.required ? '' : ` ${t('optional')}`}
                        </label>
                        <input
                          id={id}
                          type={spec.secret ? 'password' : 'text'}
                          inputMode={spec.numeric ? 'numeric' : undefined}
                          autoComplete="off"
                          dir="ltr"
                          value={values[spec.name] ?? ''}
                          onChange={(event) => setValues((current) => ({ ...current, [spec.name]: event.target.value }))}
                          aria-invalid={wrong || undefined}
                          aria-describedby={`${id}-help`}
                          className={cn('h-10 rounded-lg border bg-background px-3 text-sm', wrong ? 'border-destructive' : 'border-input')}
                        />
                        <span id={`${id}-help`} className="font-normal text-muted-foreground">
                          {t(`fields.${spec.name}.help`)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex max-w-sm flex-col gap-1 text-xs font-medium">
                  <label htmlFor={`connections-${platform}-project`}>{t('projectLabel')}</label>
                  <select id={`connections-${platform}-project`} aria-describedby={`connections-${platform}-project-help`} value={projectId} onChange={(event) => setProjectId(event.target.value)} className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
                    <option value="">{t('projectNone')}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <span id={`connections-${platform}-project-help`} className="font-normal text-muted-foreground">{t('projectHelp')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" disabled={pending !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60" data-testid={`connections-${platform}-save`}>
                    {pending === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    {t('saveAndCheck')}
                  </button>
                  <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                    {t('cancel')}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{t('privacy')}</p>
              </form>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
