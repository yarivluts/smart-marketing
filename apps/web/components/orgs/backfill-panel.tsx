'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { CheckCircle2, CircleDashed, History, KeyRound, Send, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BackfillPanelSchema {
  kind: string;
  name: string;
}

export interface BackfillPanelEntry {
  backfillId: string;
  status: 'requested' | 'delivered' | 'receiving' | 'completed' | 'failed';
  requestedAt: string;
  failureReason?: string;
  report?: { records_sent: number; batches: number };
  progress: { batches: number; accepted: number; duplicates: number; quarantined: number };
}

export interface BackfillPanelProps {
  orgId: string;
  projectId: string;
  environmentId: string;
  environmentLabel: string;
  canConfigure: boolean;
  endpoint: { url: string; schemas: BackfillPanelSchema[] } | null;
  /** Registered schemas an admin can ask the integrator to resend. */
  availableSchemas: BackfillPanelSchema[];
  backfills: BackfillPanelEntry[];
}

const STEPS = ['requested', 'delivered', 'receiving', 'completed'] as const;

function schemaKey(schema: BackfillPanelSchema): string {
  return `${schema.kind}:${schema.name}`;
}

/**
 * The web side of the backfill loop: register the integrator endpoint (its signing secret shown
 * once), ask it to resend existing records, and follow each backfill from request to completion.
 */
export function BackfillPanel({ orgId, projectId, environmentId, environmentLabel, canConfigure, endpoint, availableSchemas, backfills }: BackfillPanelProps): React.ReactElement {
  const t = useTranslations('Backfill');
  const router = useRouter();
  const [url, setUrl] = React.useState(endpoint?.url ?? '');
  const [selected, setSelected] = React.useState<Set<string>>(new Set((endpoint?.schemas ?? availableSchemas.filter((schema) => schema.kind === 'entity')).map(schemaKey)));
  const [pending, setPending] = React.useState<'save' | 'rotate' | 'request' | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const base = `/api/orgs/${orgId}/projects/${projectId}`;

  async function saveEndpoint(rotateSecret: boolean): Promise<void> {
    setPending(rotateSecret ? 'rotate' : 'save');
    setMessage(null);
    try {
      const schemas = availableSchemas.filter((schema) => selected.has(schemaKey(schema)));
      const response = await fetch(`${base}/backfill-endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentId, url, schemas, rotateSecret }),
      });
      const body = (await response.json().catch(() => ({}))) as { signingSecret?: string; reasons?: string[] };
      if (!response.ok) {
        setMessage({ tone: 'error', text: body.reasons?.length ? t('saveErrorReasons', { reasons: body.reasons.join('; ') }) : t('saveError') });
        return;
      }
      setSecret(body.signingSecret ?? null);
      setMessage({ tone: 'ok', text: t('saved') });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function requestNow(): Promise<void> {
    setPending('request');
    setMessage(null);
    try {
      const response = await fetch(`${base}/backfills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentId }),
      });
      const body = (await response.json().catch(() => ({}))) as { backfill?: { status: string; failureReason?: string } };
      if (!response.ok || !body.backfill) {
        setMessage({ tone: 'error', text: t('requestError') });
      } else if (body.backfill.status === 'failed') {
        setMessage({ tone: 'error', text: t('requestFailed', { reason: body.backfill.failureReason ?? '' }) });
      } else {
        setMessage({ tone: 'ok', text: t('requestDelivered') });
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="backfill-heading" data-testid="backfill-panel">
      <header className="flex flex-col gap-1">
        <h2 id="backfill-heading" className="flex items-center gap-2 text-lg font-semibold">
          <History className="h-5 w-5 text-primary" />
          {t('heading')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('description', { environment: environmentLabel })}</p>
      </header>

      {endpoint ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium" dir="ltr">
              {endpoint.url}
            </p>
            <p className="text-xs text-muted-foreground">{t('endpointSchemas', { schemas: endpoint.schemas.map((schema) => schema.name).join(', ') })}</p>
          </div>
          {canConfigure ? (
            <button
              type="button"
              onClick={requestNow}
              disabled={pending !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {pending === 'request' ? t('requesting') : t('requestButton')}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t('noEndpoint')}</p>
      )}

      {canConfigure ? (
        <details className="rounded-xl border border-border px-4 py-3 text-sm" open={!endpoint}>
          <summary className="cursor-pointer font-medium">{endpoint ? t('editEndpoint') : t('registerEndpoint')}</summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{t('urlLabel')}</span>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={t('urlPlaceholder')}
                dir="ltr"
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs font-medium text-muted-foreground">{t('schemasLabel')}</legend>
              {availableSchemas.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('noSchemas')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableSchemas.map((schema) => {
                    const key = schemaKey(schema);
                    return (
                      <label key={key} className={cn('flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs', selected.has(key) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={selected.has(key)}
                          onChange={() =>
                            setSelected((previous) => {
                              const next = new Set(previous);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        />
                        {schema.name} · {schema.kind}
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => saveEndpoint(false)}
                disabled={pending !== null || url.trim().length === 0 || selected.size === 0}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
              >
                {pending === 'save' ? t('saving') : t('saveButton')}
              </button>
              {endpoint ? (
                <button
                  type="button"
                  onClick={() => saveEndpoint(true)}
                  disabled={pending !== null || url.trim().length === 0 || selected.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" />
                  {pending === 'rotate' ? t('saving') : t('rotateButton')}
                </button>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}

      {secret ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm" role="status">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4 text-warning" />
            {t('secretOnce')}
          </p>
          <code className="break-all rounded-lg bg-background px-3 py-2 text-xs" dir="ltr" data-testid="backfill-secret">
            {secret}
          </code>
        </div>
      ) : null}

      {message ? <p className={cn('text-sm', message.tone === 'ok' ? 'text-success' : 'text-destructive')}>{message.text}</p> : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('historyHeading')}</h3>
        {backfills.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noBackfills')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {backfills.map((backfill) => {
              const reached = backfill.status === 'failed' ? -1 : STEPS.indexOf(backfill.status);
              return (
                <li key={backfill.backfillId} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 text-sm" data-testid={`backfill-${backfill.backfillId}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {backfill.backfillId}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('requestedAt', { at: backfill.requestedAt })}</span>
                  </div>
                  {backfill.status === 'failed' ? (
                    <p className="flex items-center gap-2 text-destructive">
                      <TriangleAlert className="h-4 w-4" />
                      {t('failedLine', { reason: backfill.failureReason ?? '' })}
                    </p>
                  ) : (
                    <ol className="flex flex-wrap items-center gap-1.5">
                      {STEPS.map((step, index) => (
                        <li key={step} className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs', index <= reached ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
                          {index <= reached ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                          {t(`status.${step}`)}
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('progressLine', {
                      batches: backfill.progress.batches,
                      accepted: backfill.progress.accepted,
                      duplicates: backfill.progress.duplicates,
                      quarantined: backfill.progress.quarantined,
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
