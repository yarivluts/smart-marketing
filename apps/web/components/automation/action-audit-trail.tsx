'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import {
  Search,
  RotateCcw,
  Clock,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from '@/components/ui/table';
import type { DiffEntry } from './proposal-diff-card';

export interface AuditActionItem {
  id: string;
  targetId: string;
  targetLabel: string;
  actionType: string;
  platform?: string;
  status: 'awaiting_approval' | 'approved' | 'executed' | 'verified' | 'rolled_back' | 'failed' | 'rejected' | string;
  beforeDailyBudgetUsd?: number;
  afterDailyBudgetUsd?: number;
  diffEntries?: DiffEntry[];
  executedAt?: string;
  executedBy?: string;
  rolledBackAt?: string;
  rollbackActionId?: string;
  reason?: string;
}

export interface ActionAuditTrailProps {
  actions: AuditActionItem[];
  onRollback?: (actionId: string) => Promise<void> | void;
  isLoading?: boolean;
  className?: string;
  pageSize?: number;
}

export function ActionAuditTrail({
  actions,
  onRollback,
  isLoading = false,
  className,
  pageSize: _pageSize = 10,
}: ActionAuditTrailProps): React.ReactElement {
  const locale = useLocale();
  const isRtl = locale === 'he';

  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [rollingBackId, setRollingBackId] = React.useState<string | null>(null);

  const filteredActions = React.useMemo(() => {
    return actions.filter((act) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        act.targetLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        act.actionType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        act.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        act.status === statusFilter ||
        (statusFilter === 'active' && (act.status === 'executed' || act.status === 'verified')) ||
        (statusFilter === 'pending' && (act.status === 'awaiting_approval' || act.status === 'approved'));

      return matchesSearch && matchesStatus;
    });
  }, [actions, searchQuery, statusFilter]);

  async function handleRollback(actionId: string) {
    setRollingBackId(actionId);
    try {
      if (onRollback) {
        await onRollback(actionId);
      }
    } finally {
      setRollingBackId(null);
    }
  }

  const statusColors: Record<string, { bg: string; text: string; border: string }> = {
    executed: {
      bg: 'bg-emerald-100 dark:bg-emerald-950/60',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800',
    },
    verified: {
      bg: 'bg-emerald-100 dark:bg-emerald-950/60',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800',
    },
    rolled_back: {
      bg: 'bg-amber-100 dark:bg-amber-950/60',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800',
    },
    approved: {
      bg: 'bg-blue-100 dark:bg-blue-950/60',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-200 dark:border-blue-800',
    },
    awaiting_approval: {
      bg: 'bg-purple-100 dark:bg-purple-950/60',
      text: 'text-purple-700 dark:text-purple-300',
      border: 'border-purple-200 dark:border-purple-800',
    },
    failed: {
      bg: 'bg-rose-100 dark:bg-rose-950/60',
      text: 'text-rose-700 dark:text-rose-300',
      border: 'border-rose-200 dark:border-rose-800',
    },
    rejected: {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-700 dark:text-slate-300',
      border: 'border-slate-200 dark:border-slate-700',
    },
  };

  return (
    <div
      data-testid="audit-trail-container"
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn('flex flex-col gap-4', className)}
    >
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            data-testid="audit-search-input"
            type="text"
            placeholder={locale === 'he' ? 'חפש היסטוריית פעולות לפי יעד או מזהה...' : 'Search audit actions by target or ID...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ps-9 h-9 text-xs rounded-xl"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl border border-border/60 text-xs">
            <button
              type="button"
              data-testid="filter-status-all"
              onClick={() => setStatusFilter('all')}
              className={cn(
                'rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer',
                statusFilter === 'all' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {locale === 'he' ? 'הכל' : 'All'} ({actions.length})
            </button>
            <button
              type="button"
              data-testid="filter-status-executed"
              onClick={() => setStatusFilter('active')}
              className={cn(
                'rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer',
                statusFilter === 'active' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {locale === 'he' ? 'בוצע' : 'Executed'}
            </button>
            <button
              type="button"
              data-testid="filter-status-rolled-back"
              onClick={() => setStatusFilter('rolled_back')}
              className={cn(
                'rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer',
                statusFilter === 'rolled_back' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {locale === 'he' ? 'בוטל' : 'Rolled Back'}
            </button>
            <button
              type="button"
              data-testid="filter-status-pending"
              onClick={() => setStatusFilter('pending')}
              className={cn(
                'rounded-lg px-2.5 py-1 font-medium transition-colors cursor-pointer',
                statusFilter === 'pending' ? 'bg-card text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {locale === 'he' ? 'ממתין' : 'Pending'}
            </button>
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{locale === 'he' ? 'יעד / קמפיין' : 'Target / Campaign'}</TableHead>
              <TableHead>{locale === 'he' ? 'סוג פעולה' : 'Action Type'}</TableHead>
              <TableHead>{locale === 'he' ? 'שינוי (Diff)' : 'Change (Diff)'}</TableHead>
              <TableHead>{locale === 'he' ? 'סטטוס' : 'Status'}</TableHead>
              <TableHead>{locale === 'he' ? 'זמן ביצוע' : 'Executed At'}</TableHead>
              <TableHead className="text-end">{locale === 'he' ? 'פעולות' : 'Actions'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredActions.length === 0 ? (
              <TableEmpty
                colSpan={6}
                message={
                  searchQuery || statusFilter !== 'all'
                    ? locale === 'he' ? 'לא נמצאו פעולות התואמות לחיפוש' : 'No actions matching your filter'
                    : locale === 'he' ? 'אין פעולות אוטומציה בהיסטוריה' : 'No automation actions in audit log'
                }
              />
            ) : (
              filteredActions.map((act) => {
                const colors = statusColors[act.status] || {
                  bg: 'bg-muted',
                  text: 'text-muted-foreground',
                  border: 'border-border',
                };

                const diffItems: DiffEntry[] =
                  act.diffEntries && act.diffEntries.length > 0
                    ? act.diffEntries
                    : act.beforeDailyBudgetUsd !== undefined && act.afterDailyBudgetUsd !== undefined
                      ? [
                          {
                            key: 'Daily Budget',
                            before: `$${act.beforeDailyBudgetUsd}/day`,
                            after: `$${act.afterDailyBudgetUsd}/day`,
                          },
                        ]
                      : [];

                const canRollback =
                  (act.status === 'executed' || act.status === 'verified') && !!onRollback;

                return (
                  <TableRow key={act.id} data-testid={`action-row-${act.id}`}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground text-sm">{act.targetLabel}</span>
                        <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[160px]">
                          {act.targetId}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="rounded-lg bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground capitalize">
                        {act.actionType.replace(/_/g, ' ')}
                      </span>
                    </TableCell>

                    <TableCell>
                      {diffItems.length > 0 ? (
                        <div className="flex flex-col gap-0.5 text-xs">
                          {diffItems.map((diff, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 font-medium">
                              <span className="line-through text-muted-foreground" dir="ltr">
                                {String(diff.before)}
                              </span>
                              <span className="text-muted-foreground">{'→'}</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">
                                {String(diff.after)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <span
                        data-testid={`status-${act.id}`}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          colors.bg,
                          colors.text,
                          colors.border,
                        )}
                      >
                        {act.status}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground" dir="ltr">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>{act.executedAt || act.rolledBackAt || '—'}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-end">
                      {canRollback && (
                        <button
                          type="button"
                          data-testid={`rollback-btn-${act.id}`}
                          disabled={isLoading || rollingBackId === act.id}
                          onClick={() => handleRollback(act.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 cursor-pointer active:scale-95"
                        >
                          {rollingBackId === act.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          <span>{locale === 'he' ? 'בטל שינוי' : '1-Click Rollback'}</span>
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
