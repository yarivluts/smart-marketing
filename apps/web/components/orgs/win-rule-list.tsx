'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import type { WinRuleSummaryView } from '@/lib/orgs/win-rule-view';

export interface WinRuleListProps {
  orgId: string;
  projectId: string;
  winRules: WinRuleSummaryView[];
}

function describeFilters(rule: WinRuleSummaryView, t: (key: string) => string): string {
  if (rule.filters.length === 0) {
    return t('anyOccurrence');
  }
  return rule.filters.map((filter) => `${filter.field} ${filter.operator} ${filter.value}`).join(' AND ');
}

/** One win rule's row: schema + filter summary, an active/disabled toggle, and a delete button (KAN-65). */
function WinRuleRow({ orgId, projectId, rule }: { orgId: string; projectId: string; rule: WinRuleSummaryView }): React.ReactElement {
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
    <li className="flex flex-col gap-1 rounded-md border border-input px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-medium">{rule.name}</span>
          <span className="text-xs text-muted-foreground">
            {t('ruleSummary', { schemaName: rule.schemaName, filterSummary: describeFilters(rule, t) })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={rule.active ? 'text-xs text-green-600' : 'text-xs text-muted-foreground'}>
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
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {t('actionError')}
        </p>
      ) : null}
    </li>
  );
}

export function WinRuleList({ orgId, projectId, winRules }: WinRuleListProps): React.ReactElement {
  const t = useTranslations('WinRules');

  if (winRules.length === 0) {
    return <p className="text-muted-foreground">{t('noWinRules')}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {winRules.map((rule) => (
        <WinRuleRow key={rule.id} orgId={orgId} projectId={projectId} rule={rule} />
      ))}
    </ul>
  );
}
