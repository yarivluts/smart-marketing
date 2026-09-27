'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { ArrowRight, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EditWinRuleForm } from '@/components/orgs/edit-win-rule-form';
import type { WinRuleSummaryView } from '@/lib/orgs/win-rule-view';

export interface WinRuleListProps {
  orgId: string;
  projectId: string;
  winRules: WinRuleSummaryView[];
  /** Wins each rule fired among the page's recent-wins read, keyed by rule id. Omit to hide the trigger -> win strip. */
  winCounts?: Record<string, number>;
}

function describeFilters(rule: WinRuleSummaryView, t: (key: string) => string): string {
  if (rule.filters.length === 0) {
    return t('anyOccurrence');
  }
  return rule.filters.map((filter) => `${filter.field} ${filter.operator} ${filter.value}`).join(` ${t('filterJoiner')} `);
}

/** One win rule's row: schema + filter summary, an active/disabled toggle, a delete button (KAN-65), and an inline edit form for the rule's own name/filters/win-type (KAN-130). */
function WinRuleRow({ orgId, projectId, rule, winCount }: { orgId: string; projectId: string; rule: WinRuleSummaryView; winCount?: number }): React.ReactElement {
  const t = useTranslations('WinRules');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function toggleActive(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/win-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !rule.active }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    setError(false);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/orgs/${orgId}/projects/${projectId}/win-rules/${rule.id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="win-rule-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', rule.active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
            <Trophy className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{rule.name}</span>
              {rule.winType !== 'generic' ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">{t(`winTypeLabel.${rule.winType}`)}</span>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {t('ruleSummary', { schemaName: rule.schemaName, filterSummary: describeFilters(rule, t) })}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
              rule.active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', rule.active ? 'bg-success' : 'bg-muted-foreground/60')} aria-hidden="true" />
            {rule.active ? t('statusActive') : t('statusInactive')}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={toggleActive} disabled={submitting}>
            {rule.active ? t('disableRule') : t('enableRule')}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={submitting}>
            {t('deleteRule')}
          </Button>
        </div>
      </div>
      {winCount !== undefined ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs" role="group" aria-label={t('ruleFlowLabel')}>
          <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-foreground">{rule.schemaName}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
          <span className="rounded-md border border-border bg-background px-2 py-1 text-foreground">
            {rule.filters.length === 0 ? t('anyOccurrence') : t('ruleFilterCount', { count: rule.filters.length })}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
          <span className={cn('rounded-md px-2 py-1 font-semibold', winCount > 0 ? 'bg-success/15 text-success' : 'bg-background text-muted-foreground')}>
            {t('ruleWinCount', { count: winCount })}
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap">
        <EditWinRuleForm
          orgId={orgId}
          projectId={projectId}
          winRuleId={rule.id}
          initialName={rule.name}
          initialFilters={rule.filters}
          initialWinType={rule.winType}
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('actionError')}
        </p>
      ) : null}
    </li>
  );
}

export function WinRuleList({ orgId, projectId, winRules, winCounts }: WinRuleListProps): React.ReactElement {
  const t = useTranslations('WinRules');

  if (winRules.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
        <Trophy className="h-6 w-6 text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{t('noWinRules')}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {winRules.map((rule) => (
        <WinRuleRow key={rule.id} orgId={orgId} projectId={projectId} rule={rule} winCount={winCounts ? (winCounts[rule.id] ?? 0) : undefined} />
      ))}
    </ul>
  );
}
