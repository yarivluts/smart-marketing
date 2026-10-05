'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  Radio,
  XCircle,
  AlertTriangle,
  Plus,
  X,
} from 'lucide-react';
import type { InstallationReport, InstallationSchemaStatus } from '@growthos/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface InstallationCheckProps {
  orgId: string;
  projectId: string;
  environmentId: string;
  environmentName: string;
  /** The schemas checked by default: the project's registered schemas. */
  defaultExpected: readonly string[];
  initialReport: InstallationReport;
}

const POLL_MS = 5000;

const STATUS_STYLE: Record<
  InstallationSchemaStatus,
  { icon: typeof CheckCircle2; className: string }
> = {
  receiving: { icon: CheckCircle2, className: 'text-success' },
  stale: { icon: AlertTriangle, className: 'text-warning' },
  quarantined: { icon: XCircle, className: 'text-destructive' },
  registered_no_data: { icon: CircleDashed, className: 'text-muted-foreground' },
  not_registered: { icon: XCircle, className: 'text-destructive' },
};

/**
 * The live installation check: for each expected schema, what really arrived in this environment -
 * receiving, stale, quarantined (with the reasons), registered with no data, not registered - and
 * the fix. "Listen" re-checks every few seconds, so an integrator sends from their site and watches
 * each line turn green. Every status comes from real records; nothing is sent by checking.
 */
export function InstallationCheck({
  orgId,
  projectId,
  environmentId,
  environmentName,
  defaultExpected,
  initialReport,
}: InstallationCheckProps): React.ReactElement {
  const t = useTranslations('Installation');
  const locale = useLocale();
  const [expected, setExpected] = useState<string[]>([...defaultExpected]);
  const [report, setReport] = useState(initialReport);
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [newName, setNewName] = useState('');
  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' });

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ environmentId, expect: expected.join(',') });
      const response = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/installation?${query.toString()}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        setError(true);
        return;
      }
      setReport(((await response.json()) as { report: InstallationReport }).report);
      setError(false);
      setCheckedAt(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [orgId, projectId, environmentId, expected]);

  useEffect(() => {
    if (!listening) return;
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(timer);
  }, [listening, check]);

  function addName(): void {
    const name = newName.trim();
    if (name && !expected.includes(name)) setExpected([...expected, name]);
    setNewName('');
  }

  const ok = report.status === 'ok';
  return (
    <section className="flex flex-col gap-4" data-testid="installation-check">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3',
          ok ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10',
        )}
      >
        <div className="flex items-center gap-2 text-sm font-semibold" role="status">
          {ok ? (
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
          )}
          {ok
            ? t('statusOk', { environment: environmentName })
            : t('statusAttention', { environment: environmentName })}
        </div>
        <div className="flex items-center gap-2">
          {checkedAt ? (
            <span className="text-xs text-muted-foreground">
              {t('checkedAt', { time: time.format(checkedAt) })}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={listening ? 'default' : 'outline'}
            onClick={() => setListening((value) => !value)}
          >
            {listening ? (
              <Radio className="me-1.5 h-4 w-4 animate-pulse" aria-hidden="true" />
            ) : (
              <Radio className="me-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {listening ? t('stopListening') : t('listen')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void check()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t('checkNow')}
          </Button>
        </div>
      </div>
      {listening ? <p className="text-xs text-muted-foreground">{t('listeningHint')}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('checkError')}
        </p>
      ) : null}

      {report.schemas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('nothingYet')}</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {report.schemas.map((schema) => {
          const style = STATUS_STYLE[schema.status];
          const Icon = style.icon;
          return (
            <li
              key={schema.name}
              className="flex flex-col gap-1 rounded-xl border border-border p-3 text-sm"
              data-testid={`installation-schema-${schema.name}`}
              data-status={schema.status}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Icon className={cn('h-4 w-4 shrink-0', style.className)} aria-hidden="true" />
                <code className="font-mono text-xs" dir="ltr">
                  {schema.name}
                </code>
                <span className={cn('text-xs font-medium', style.className)}>
                  {t(`status.${schema.status}`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {schema.lastAcceptedAt
                    ? t('lastAccepted', { time: time.format(new Date(schema.lastAcceptedAt)) })
                    : t('neverAccepted')}
                  {schema.openQuarantined
                    ? ` · ${t('inQuarantine', { count: schema.openQuarantined })}`
                    : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setExpected(expected.filter((name) => name !== schema.name))}
                  className="ms-auto rounded p-0.5 text-muted-foreground hover:bg-muted"
                  aria-label={t('removeSchema', { name: schema.name })}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {schema.quarantineReasons.length ? (
                <p className="font-mono text-[11px] text-destructive" dir="ltr">
                  {schema.quarantineReasons.join(', ')}
                </p>
              ) : null}
              {schema.fix ? (
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {schema.fix}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addName();
            }
          }}
          placeholder={t('addSchemaPlaceholder')}
          aria-label={t('addSchemaPlaceholder')}
          dir="ltr"
          className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addName}
          disabled={!newName.trim()}
        >
          <Plus className="me-1 h-4 w-4" aria-hidden="true" />
          {t('addSchema')}
        </Button>
      </div>
    </section>
  );
}
