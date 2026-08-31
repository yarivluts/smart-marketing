'use client';

import React, { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import {
  Sparkles,
  ShieldCheck,
  History,
  CheckCircle2,
  Flame,
  Search,
  CheckCircle,
  X,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import {
  SmartRecommendationCard,
  type SmartRecommendationCardProps,
  type CopilotActionProposal,
} from './smart-recommendation-card';
import { AutomationKillSwitchPanel } from './automation-kill-switch-panel';
import { AutomationGuardrailPolicyForm } from './automation-guardrail-policy-form';
import { AutomationSeedTargetForm } from './automation-seed-target-form';
import { AutomationProposeActionForm } from './automation-propose-action-form';
import { AutomationProposeCampaignDraftForm } from './automation-propose-campaign-draft-form';
import { AutomationProposeKeywordEditForm } from './automation-propose-keyword-edit-form';
import { AutomationProposeAdEditForm } from './automation-propose-ad-edit-form';
import { AutomationProposeMetaAdSetEditForm } from './automation-propose-meta-ad-set-edit-form';
import { AutomationProposeMetaAdSetTargetingEditForm } from './automation-propose-meta-ad-set-targeting-edit-form';
import { AutomationProposeMetaAdCreativeEditForm } from './automation-propose-meta-ad-creative-edit-form';
import { AutomationActionList } from './automation-action-list';
import type {
  AutomationActionView,
  AutomationConnectionOption,
  AutomationGuardrailPolicyView,
  AutomationKillSwitchStatus,
  AutomationTargetView,
} from '@/lib/orgs/automation-view';

export interface AutomationHubDashboardProps {
  orgId: string;
  projectId: string;
  projectName: string;
  killSwitchStatus: AutomationKillSwitchStatus;
  policy: AutomationGuardrailPolicyView;
  targets: AutomationTargetView[];
  actions: AutomationActionView[];
  connections: AutomationConnectionOption[];
  proactiveRecommendations: Omit<SmartRecommendationCardProps, 'onApprove' | 'onDismiss'>[];
  canExecute: boolean;
  canApprove: boolean;
}

export function AutomationHubDashboard({
  orgId,
  projectId,
  projectName: _projectName,
  killSwitchStatus,
  policy,
  targets,
  actions,
  connections,
  proactiveRecommendations: initialRecommendations,
  canExecute: _canExecute,
  canApprove,
}: AutomationHubDashboardProps): React.ReactElement {
  const t = useTranslations('Automation');
  const router = useRouter();

  const [activeSubTab, setActiveSubTab] = useState<'proposals' | 'audit' | 'rules'>('proposals');
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  // Executed & historical actions for Audit tab
  const historicalActions = useMemo(() => {
    return actions.filter((a) => {
      const matchesStatus =
        auditStatusFilter === 'all' ||
        (auditStatusFilter === 'executed' && (a.status === 'executed' || a.status === 'verified')) ||
        (auditStatusFilter === 'rolled_back' && a.status === 'rolled_back') ||
        (auditStatusFilter === 'failed' && a.status === 'failed');

      const matchesSearch =
        !searchQuery.trim() ||
        a.targetLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.id.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [actions, auditStatusFilter, searchQuery]);

  // Pending actions for Proposals tab
  const pendingActions = useMemo(() => {
    return actions.filter(
      (a) => a.status === 'awaiting_approval' || a.status === 'proposed' || a.status === 'blocked',
    );
  }, [actions]);

  // Filtered proactive recommendations
  const filteredRecommendations = useMemo(() => {
    return recommendations.filter(
      (r) => categoryFilter === 'all' || r.category === categoryFilter,
    );
  }, [recommendations, categoryFilter]);

  const totalPendingCount = pendingActions.length + recommendations.length;

  async function handleApproveRecommendation(proposal: CopilotActionProposal): Promise<void> {
    const res = await fetch(
      `/api/orgs/${orgId}/projects/${projectId}/automation/actions/quick-execute`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetId: proposal.targetId,
          actionType: proposal.actionType,
          afterDailyBudgetUsd:
            proposal.actionType === 'budget_change'
              ? (proposal.payload?.dailyBudgetUsd as number || proposal.payload?.afterDailyBudgetUsd as number)
              : undefined,
        }),
      },
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || t('proposeError'));
    }

    setToastMessage(t('actionExecutedSuccess'));
    router.refresh();
  }

  function handleDismissRecommendation(id: string): void {
    setRecommendations((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleRollbackAction(actionId: string): Promise<void> {
    if (rollingBackId) return;
    setRollingBackId(actionId);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/projects/${projectId}/automation/actions/${actionId}/rollback`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        },
      );
      if (res.ok) {
        setToastMessage(t('rollbackSuccess'));
        router.refresh();
      } else {
        setToastMessage(t('rollbackError'));
      }
    } catch {
      setToastMessage(t('rollbackError'));
    } finally {
      setRollingBackId(null);
    }
  }

  return (
    <div data-testid="automation-hub-dashboard" className="flex flex-col gap-8 pb-16">
      {/* 1. Header with Global Stats */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t('hubTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('hubDescription')}</p>
        </div>

        {/* Global Badges */}
        <div className="flex items-center gap-3">
          {killSwitchStatus.engaged ? (
            <span
              data-testid="kill-switch-active-badge"
              className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground shadow-xs"
            >
              <Flame className="h-4 w-4" aria-hidden="true" />
              <span>{t('killSwitchEngagedBadge')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>{t('killSwitchDisengagedNote')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. Primary Sub-Navigation Tabs */}
      <div className="flex border-b border-border">
        <div className="flex gap-4">
          <button
            type="button"
            data-testid="tab-proposals"
            onClick={() => setActiveSubTab('proposals')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'proposals'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabProposals')}</span>
            {totalPendingCount > 0 && (
              <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-bold">
                {totalPendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="tab-audit"
            onClick={() => setActiveSubTab('audit')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'audit'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabHistory')}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {historicalActions.length}
            </span>
          </button>

          <button
            type="button"
            data-testid="tab-rules"
            onClick={() => setActiveSubTab('rules')}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'rules'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>{t('tabGuardrails')}</span>
          </button>
        </div>
      </div>

      {/* 3. Sub-Tab 1: Pending Optimization Proposals */}
      {activeSubTab === 'proposals' && (
        <div data-testid="proposals-tab-content" className="flex flex-col gap-6">
          {/* Category Filter Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'all', label: t('categoryAll') },
              { key: 'budget', label: t('categoryBudget') },
              { key: 'ad_fatigue', label: t('categoryAdFatigue') },
              { key: 'funnel_dropoff', label: t('categoryFunnelDropoff') },
              { key: 'pacing', label: t('categoryPacing') },
            ].map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setCategoryFilter(cat.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  categoryFilter === cat.key
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Smart Recommendation Cards Grid */}
          {filteredRecommendations.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRecommendations.map((rec) => (
                <SmartRecommendationCard
                  key={rec.id}
                  {...rec}
                  onApprove={handleApproveRecommendation}
                  onDismiss={handleDismissRecommendation}
                />
              ))}
            </div>
          )}

          {/* Pending Pipeline Actions (from AutomationActionList) */}
          {pendingActions.length > 0 && (
            <div className="flex flex-col gap-3 mt-4">
              <h3 className="text-sm font-bold tracking-tight text-foreground">
                <span>{t('actionsHeading')}</span>
                {` (${pendingActions.length})`}
              </h3>
              <AutomationActionList
                orgId={orgId}
                projectId={projectId}
                actions={pendingActions}
                canApprove={canApprove}
              />
            </div>
          )}

          {/* Empty State */}
          {filteredRecommendations.length === 0 && pendingActions.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-foreground">
                {t('proposalsEmptyTitle')}
              </h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                {t('proposalsEmptyDescription')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 4. Sub-Tab 2: Execution Logs & Audit Trail */}
      {activeSubTab === 'audit' && (
        <div data-testid="audit-tab-content" className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              {[
                { key: 'all', label: t('filterAll') },
                { key: 'executed', label: t('filterExecuted') },
                { key: 'rolled_back', label: t('filterRolledBack') },
                { key: 'failed', label: t('filterFailed') },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setAuditStatusFilter(st.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    auditStatusFilter === st.key
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                data-testid="audit-search-input"
                placeholder={t('searchAuditPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-input bg-background py-1.5 ps-8 pe-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Audit Rows */}
          {historicalActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
              <History className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-xs">{t('auditEmptyNote')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historicalActions.map((action) => (
                <div
                  key={action.id}
                  data-testid={`action-row-${action.id}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-xs shadow-xs"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{action.targetLabel}</span>
                      <span
                        data-testid={`status-${action.id}`}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          action.status === 'executed' || action.status === 'verified'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : action.status === 'rolled_back'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {action.status}
                      </span>
                    </div>

                    <div className="text-muted-foreground flex flex-wrap items-center gap-2">
                      {action.diffEntries.map((diff) => (
                        <span key={diff.key} className="inline-flex items-center gap-1">
                          <span>{diff.key}{':'}</span>
                          <span className="line-through text-muted-foreground" dir="ltr">{String(diff.before)}</span>
                          <span>{'→'}</span>
                          <span className="font-bold text-foreground" dir="ltr">{String(diff.after)}</span>
                        </span>
                      ))}
                    </div>

                    {action.executedAt && (
                      <span className="text-[10px] text-muted-foreground" dir="ltr">
                        {action.executedAt}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {(action.status === 'executed' || action.status === 'verified') && (
                      <button
                        type="button"
                        data-testid={`rollback-btn-${action.id}`}
                        disabled={rollingBackId === action.id}
                        onClick={() => handleRollbackAction(action.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {rollingBackId === action.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        <span>{t('oneClickRollback')}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Sub-Tab 3: Automation Rules & Guardrails */}
      {activeSubTab === 'rules' && (
        <div data-testid="rules-tab-content" className="flex flex-col gap-8 max-w-3xl">
          {/* Emergency Kill Switch */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('killSwitchHeading')}</h2>
            <AutomationKillSwitchPanel orgId={orgId} status={killSwitchStatus} />
          </section>

          {/* Guardrail Policy */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('policyHeading')}</h2>
            <AutomationGuardrailPolicyForm orgId={orgId} projectId={projectId} policy={policy} />
          </section>

          {/* Seed Target */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('targetsHeading')}</h2>
            <AutomationSeedTargetForm orgId={orgId} projectId={projectId} connections={connections} />
          </section>

          {/* Manual Action Proposal Forms */}
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('proposeHeading')}</h2>
            <AutomationProposeActionForm orgId={orgId} projectId={projectId} targets={targets} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('proposeDraftHeading')}</h2>
            <AutomationProposeCampaignDraftForm
              orgId={orgId}
              projectId={projectId}
              targets={targets.filter((target) => !target.campaignResourceName)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('proposeKeywordEditHeading')}</h2>
            <AutomationProposeKeywordEditForm
              orgId={orgId}
              projectId={projectId}
              targets={targets.filter((target) => (target.adGroupResourceNames?.length ?? 0) > 0)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('proposeAdEditHeading')}</h2>
            <AutomationProposeAdEditForm
              orgId={orgId}
              projectId={projectId}
              targets={targets.filter((target) => (target.adResourceNames?.length ?? 0) > 0)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('proposeMetaAdSetEditHeading')}</h2>
            <AutomationProposeMetaAdSetEditForm
              orgId={orgId}
              projectId={projectId}
              targets={targets.filter((target) => (target.metaAdSetResourceNames?.length ?? 0) > 0)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('proposeMetaAdSetTargetingEditHeading')}</h2>
            <AutomationProposeMetaAdSetTargetingEditForm
              orgId={orgId}
              projectId={projectId}
              targets={targets.filter((target) => (target.metaAdSetResourceNames?.length ?? 0) > 0)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('proposeMetaAdCreativeEditHeading')}</h2>
            <AutomationProposeMetaAdCreativeEditForm
              orgId={orgId}
              projectId={projectId}
              targets={targets.filter((target) => (target.metaAdResourceNames?.length ?? 0) > 0)}
            />
          </section>
        </div>
      )}
    </div>
  );
}
