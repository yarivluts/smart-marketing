'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pause, Play } from 'lucide-react';
import { siteHost } from '@growthos/shared';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { useLocalDateTime } from '@/components/ad-studio/use-local-date-time';

export interface OperatorPilotRow {
  organizationId: string;
  organizationName: string;
  projectId: string;
  siteUrl: string;
  status: string;
  lastRunOn: string | null;
  lastRunOutcome: string | null;
}

const SHORT = { dateStyle: 'short', timeStyle: 'short' } as const;

/** Every customer's Growth Pilot in one table: where it stands, when the scheduler last ran it, and a stop. */
export function OperatorPilots({ rows: initial }: { rows: OperatorPilotRow[] }): React.ReactElement {
  const t = useTranslations('GrowthPilot.operator');
  const when = useLocalDateTime(SHORT);
  const [rows, setRows] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  const toggle = async (row: OperatorPilotRow) => {
    const key = `${row.organizationId}/${row.projectId}`;
    setBusy(key);
    setError(false);
    try {
      const response = await fetch('/api/operator/growth-pilots/pause', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId: row.organizationId, projectId: row.projectId, paused: row.status !== 'paused' }),
      });
      const body = (await response.json().catch(() => ({}))) as { status?: string };
      if (!response.ok || !body.status) throw new Error('failed');
      setRows((current) => current.map((candidate) => (candidate === row ? { ...candidate, status: body.status! } : candidate)));
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  if (!rows.length) return <p className="rounded-3xl border border-dashed border-border p-6 text-sm text-muted-foreground">{t('empty')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t('failed')}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-3xl border border-border/60 bg-card shadow-soft">
        <table className="w-full text-start text-sm" data-testid="operator-pilots">
          <thead>
            <tr className="border-b border-border/60 text-xs text-muted-foreground">
              {(['site', 'organization', 'status', 'lastRun', 'action'] as const).map((column) => (
                <th key={column} className="px-4 py-3 text-start font-medium">
                  {t(`column.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = `${row.organizationId}/${row.projectId}`;
              const canToggle = row.status === 'active' || row.status === 'paused';
              return (
                <tr key={key} className="border-b border-border/40 last:border-0" data-testid="operator-pilot-row">
                  <td className="px-4 py-3 font-medium" dir="ltr">
                    <Link href={`/orgs/${row.organizationId}/projects/${row.projectId}/growth-pilot`} className="text-primary hover:underline">
                      {siteHost(row.siteUrl)}
                    </Link>
                  </td>
                  <td className="px-4 py-3" dir="auto">
                    {row.organizationName}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', row.status === 'active' ? 'bg-success/10 text-success' : row.status === 'failed' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground')}>{t(`status.${row.status}`)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.lastRunOn ? `${when(row.lastRunOn)} · ${row.lastRunOutcome ?? ''}` : t('never')}
                  </td>
                  <td className="px-4 py-3">
                    {canToggle ? (
                      <button type="button" disabled={busy === key} onClick={() => void toggle(row)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60" data-testid="operator-pilot-toggle">
                        {busy === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : row.status === 'paused' ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
                        {t(row.status === 'paused' ? 'resume' : 'pause')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
