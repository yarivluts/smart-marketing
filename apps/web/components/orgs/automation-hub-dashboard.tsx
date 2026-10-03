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
  Shield,
  Zap,
  Activity,
} from 'lucide-react';
import {
  PpPageHeader,
  PpKpiGrid,
  PpKpiCard,
  PpCard,
  PpPill,
  PpButton,
  PpEmptyState,
  ppInputClass,
} from '@/components/pastel/primitives';
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
  const executedCount = actions.filter((a) => a.status === 'executed' || a.status === 'verified').length;

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
    <div data-testid="automation-hub-dashboard" className="space-y-pp-lg pb-16">
      {/* 1. Page Header */}
      <PpPageHeader
        eyebrow="AUTOPILOT & GOVERNANCE"
        meta={killSwitchStatus.engaged ? 'Emergency Pause Active' : 'Real-time Guardrails Live'}
        title={t('hubTitle')}
        description={t('hubDescription')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {killSwitchStatus.engaged ? (
              <span
                data-testid="kill-switch-active-badge"
                className="inline-flex items-center gap-1.5 rounded-full bg-pp-error-container px-3 py-1.5 text-xs font-bold text-pp-error shadow-pp-candy"
              >
                <Flame className="h-4 w-4" aria-hidden="true" />
                <span>{t('killSwitchEngagedBadge')}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pp-secondary-container/60 px-3 py-1.5 text-xs font-semibold text-pp-secondary">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span>{t('killSwitchDisengagedNote')}</span>
              </span>
            )}
            <PpButton
              variant={activeSubTab === 'rules' ? 'primary' : 'secondary'}
              size="sm"
              icon={Shield}
              onClick={() => setActiveSubTab('rules')}
            >
              {t('tabGuardrails')}
            </PpButton>
          </div>
        }
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="flex items-center justify-between rounded-2xl bg-pp-primary-fixed/60 border border-pp-primary/20 p-3.5 text-xs text-pp-on-surface shadow-pp-candy">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-pp-primary shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-pp-outline hover:text-pp-on-surface cursor-pointer p-1 rounded-full transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 2. Top KPI Deck */}
      <PpKpiGrid>
        <PpKpiCard
          label="Active Guardrails"
          value={targets.length > 0 ? targets.length : 0}
          valueSuffix="targets"
          accent="primary"
          footer={
            policy.spendCeilingUsd
              ? `Spend cap: $${policy.spendCeilingUsd.toLocaleString()}/day`
              : 'Deterministic Rules'
          }
        />
        <PpKpiCard
          label="Autonomous Actions"
          value={executedCount}
          valueSuffix="executed"
          badge={`${actions.length} total`}
          badgeAccent="mint"
          accent="mint"
          footer="Audit Trail Verified"
        />
        <PpKpiCard
          label="Daily Spend Ceiling"
          value={policy.spendCeilingUsd ? `$${policy.spendCeilingUsd.toLocaleString()}` : '—'}
          accent="amber"
          footer="Global Circuit Breaker"
        />
        <PpKpiCard
          label="Circuit Breaker"
          value={killSwitchStatus.engaged ? 'Halted' : 'Guarded'}
          badge={killSwitchStatus.engaged ? 'Active' : 'Armed'}
          badgeAccent={killSwitchStatus.engaged ? 'error' : 'mint'}
          accent={killSwitchStatus.engaged ? 'error' : 'sky'}
          footer={killSwitchStatus.engaged ? 'Emergency Pause Active' : '0 Anomalies Detected'}
        />
      </PpKpiGrid>

      {/* 3. Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-pp-surface-container pb-3">
        <button
          type="button"
          data-testid="tab-proposals"
          onClick={() => setActiveSubTab('proposals')}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'proposals'
              ? 'bg-pp-primary text-pp-on-primary shadow-pp-candy'
              : 'bg-pp-surface-container-lowest text-pp-on-surface-variant hover:text-pp-on-surface hover:bg-pp-surface-container'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('tabProposals')}</span>
          {totalPendingCount > 0 && (
            <span className="rounded-full bg-pp-primary-fixed text-pp-on-primary-fixed px-2 py-0.5 text-[10px] font-bold">
              {totalPendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          data-testid="tab-audit"
          onClick={() => setActiveSubTab('audit')}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'audit'
              ? 'bg-pp-primary text-pp-on-primary shadow-pp-candy'
              : 'bg-pp-surface-container-lowest text-pp-on-surface-variant hover:text-pp-on-surface hover:bg-pp-surface-container'
          }`}
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('tabHistory')}</span>
          <span className="rounded-full bg-pp-surface-container px-2 py-0.5 text-[10px] font-medium text-pp-outline">
            {historicalActions.length}
          </span>
        </button>

        <button
          type="button"
          data-testid="tab-rules"
          onClick={() => setActiveSubTab('rules')}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all cursor-pointer ${
            activeSubTab === 'rules'
              ? 'bg-pp-primary text-pp-on-primary shadow-pp-candy'
              : 'bg-pp-surface-container-lowest text-pp-on-surface-variant hover:text-pp-on-surface hover:bg-pp-surface-container'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('tabGuardrails')}</span>
        </button>
      </div>

      {/* 4. Split Workspace (Left 8 cols main + Right 4 cols telemetry) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Sub-Tab 1: Pending Optimization Proposals */}
          {activeSubTab === 'proposals' && (
            <div data-testid="proposals-tab-content" className="space-y-6">
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
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                      categoryFilter === cat.key
                        ? 'bg-pp-primary text-pp-on-primary shadow-pp-candy'
                        : 'bg-pp-surface-container text-pp-on-surface-variant hover:text-pp-on-surface'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Recommendations Cards */}
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

              {/* Pending Pipeline Actions */}
              {pendingActions.length > 0 && (
                <PpCard
                  title={`${t('actionsHeading', { defaultValue: 'Pending Actions' })} (${pendingActions.length})`}
                  subtitle="Actions awaiting operator sign-off or queued for scheduled execution"
                  icon={Zap}
                  iconAccent="primary"
                >
                  <AutomationActionList
                    orgId={orgId}
                    projectId={projectId}
                    actions={pendingActions}
                    canApprove={canApprove}
                  />
                </PpCard>
              )}

              {/* Empty State */}
              {filteredRecommendations.length === 0 && pendingActions.length === 0 && (
                <PpEmptyState
                  icon={CheckCircle}
                  title={t('proposalsEmptyTitle')}
                  description={t('proposalsEmptyDescription')}
                />
              )}
            </div>
          )}

          {/* Sub-Tab 2: Execution Logs & Audit Trail */}
          {activeSubTab === 'audit' && (
            <div data-testid="audit-tab-content" className="space-y-6">
              <PpCard
                title={t('tabHistory')}
                subtitle="Complete cryptographic ledger of autonomous modifications and rollback snapshots"
                icon={History}
                iconAccent="mint"
              >
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Status Filter */}
                    <div className="flex flex-wrap items-center gap-1.5">
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
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                            auditStatusFilter === st.key
                              ? 'bg-pp-primary text-pp-on-primary shadow-pp-candy'
                              : 'bg-pp-surface-container text-pp-on-surface-variant hover:text-pp-on-surface'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    {/* Search */}
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute start-3 top-2.5 h-3.5 w-3.5 text-pp-outline" />
                      <input
                        type="text"
                        data-testid="audit-search-input"
                        placeholder={t('searchAuditPlaceholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={`${ppInputClass} ps-9 py-1.5 text-xs`}
                      />
                    </div>
                  </div>

                  {/* Audit Rows */}
                  {historicalActions.length === 0 ? (
                    <PpEmptyState
                      icon={History}
                      title={t('tabHistory')}
                      description={t('auditEmptyNote')}
                    />
                  ) : (
                    <div className="space-y-2.5">
                      {historicalActions.map((action) => (
                        <div
                          key={action.id}
                          data-testid={`action-row-${action.id}`}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-pp-subtle-inset p-4 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-pp-on-surface">{action.targetLabel}</span>
                              <span
                                data-testid={`status-${action.id}`}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  action.status === 'executed' || action.status === 'verified'
                                    ? 'bg-pp-secondary-container text-pp-secondary'
                                    : action.status === 'rolled_back'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-pp-error-container text-pp-error'
                                }`}
                              >
                                {action.status}
                              </span>
                            </div>

                            <div className="text-pp-on-surface-variant flex flex-wrap items-center gap-2">
                              {action.diffEntries.map((diff) => (
                                <span key={diff.key} className="inline-flex items-center gap-1">
                                  <span>{diff.key}:</span>
                                  <span className="line-through text-pp-outline" dir="ltr">{String(diff.before)}</span>
                                  <span>{'→'}</span>
                                  <span className="font-bold text-pp-on-surface" dir="ltr">{String(diff.after)}</span>
                                </span>
                              ))}
                            </div>

                            {action.executedAt && (
                              <span className="text-[10px] text-pp-outline" dir="ltr">
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
                                className="inline-flex items-center gap-1.5 rounded-full bg-pp-error-container px-3 py-1.5 text-xs font-semibold text-pp-error hover:bg-pp-error hover:text-pp-on-error transition-colors disabled:opacity-50 cursor-pointer"
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
              </PpCard>
            </div>
          )}

          {/* Sub-Tab 3: Automation Rules & Guardrails */}
          {activeSubTab === 'rules' && (
            <div data-testid="rules-tab-content" className="space-y-6">
              {/* Emergency Kill Switch */}
              <PpCard title={t('killSwitchHeading')} subtitle="Halt all autonomous mutations across all channels" icon={Flame} iconAccent="error">
                <AutomationKillSwitchPanel orgId={orgId} status={killSwitchStatus} />
              </PpCard>

              {/* Guardrail Policy */}
              <PpCard title={t('policyHeading')} subtitle="Define maximum daily deltas, spend caps, and allowed execution windows" icon={ShieldCheck} iconAccent="primary">
                <AutomationGuardrailPolicyForm orgId={orgId} projectId={projectId} policy={policy} />
              </PpCard>

              {/* Seed Target */}
              <PpCard title={t('targetsHeading')} subtitle="Register campaign targets for automated optimization" icon={Zap} iconAccent="mint">
                <AutomationSeedTargetForm orgId={orgId} projectId={projectId} connections={connections} />
              </PpCard>

              {/* Manual Action Proposal Forms */}
              <PpCard title={t('proposeHeading', { defaultValue: 'Propose Optimization Action' })} subtitle="Submit manual action proposal to the execution pipeline" icon={Sparkles} iconAccent="primary">
                <div className="space-y-6">
                  <AutomationProposeActionForm orgId={orgId} projectId={projectId} targets={targets} />
                  <AutomationProposeCampaignDraftForm
                    orgId={orgId}
                    projectId={projectId}
                    targets={targets.filter((target) => !target.campaignResourceName)}
                  />
                  <AutomationProposeKeywordEditForm
                    orgId={orgId}
                    projectId={projectId}
                    targets={targets.filter((target) => (target.adGroupResourceNames?.length ?? 0) > 0)}
                  />
                  <AutomationProposeAdEditForm
                    orgId={orgId}
                    projectId={projectId}
                    targets={targets.filter((target) => (target.adResourceNames?.length ?? 0) > 0)}
                  />
                  <AutomationProposeMetaAdSetEditForm
                    orgId={orgId}
                    projectId={projectId}
                    targets={targets.filter((target) => (target.metaAdSetResourceNames?.length ?? 0) > 0)}
                  />
                  <AutomationProposeMetaAdSetTargetingEditForm
                    orgId={orgId}
                    projectId={projectId}
                    targets={targets.filter((target) => (target.metaAdSetResourceNames?.length ?? 0) > 0)}
                  />
                  <AutomationProposeMetaAdCreativeEditForm
                    orgId={orgId}
                    projectId={projectId}
                    targets={targets.filter((target) => (target.metaAdResourceNames?.length ?? 0) > 0)}
                  />
                </div>
              </PpCard>
            </div>
          )}
        </div>

        {/* Right 4 Cols: Quick Circuit Breaker & Recent Telemetry */}
        <div className="lg:col-span-4 space-y-6">
          {/* Circuit Breaker Status */}
          <PpCard
            title="Circuit Breaker"
            subtitle="Global daily spend protection"
            icon={Shield}
            iconAccent={killSwitchStatus.engaged ? 'error' : 'primary'}
          >
            <div className="space-y-4">
              <div className="rounded-2xl bg-pp-subtle-inset p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-pp-outline font-medium">Daily Spend Ceiling</span>
                  <span className="font-bold text-pp-on-surface">
                    {policy.spendCeilingUsd ? `$${policy.spendCeilingUsd.toLocaleString()}` : 'No limit set'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-pp-outline font-medium">Kill Switch</span>
                  <PpPill accent={killSwitchStatus.engaged ? 'error' : 'mint'} dot>
                    {killSwitchStatus.engaged ? 'Engaged' : 'Disengaged'}
                  </PpPill>
                </div>
              </div>

              <PpButton
                variant={killSwitchStatus.engaged ? 'secondary' : 'danger'}
                size="sm"
                className="w-full"
                onClick={() => setActiveSubTab('rules')}
              >
                {killSwitchStatus.engaged ? t('killSwitchDisengageButton') : t('killSwitchEngageButton')}
              </PpButton>
            </div>
          </PpCard>

          {/* Recent Activity Mini-Feed */}
          <PpCard
            title="Recent Activity"
            subtitle="Latest pipeline events"
            icon={Activity}
            iconAccent="sky"
          >
            {actions.length === 0 ? (
              <p className="text-xs text-pp-outline py-2">{t('actionsEmptyNote')}</p>
            ) : (
              <div className="space-y-2 divide-y divide-pp-surface-container">
                {actions.slice(0, 5).map((a) => (
                  <div key={a.id} className="pt-2 first:pt-0 flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-pp-on-surface truncate">{a.targetLabel}</p>
                      <p className="text-[11px] text-pp-outline">{a.diffEntries.map((d) => d.key).join(', ') || a.status}</p>
                    </div>
                    <PpPill
                      accent={
                        a.status === 'executed' || a.status === 'verified'
                          ? 'mint'
                          : a.status === 'rolled_back'
                            ? 'amber'
                            : a.status === 'failed'
                              ? 'error'
                              : 'primary'
                      }
                    >
                      {a.status}
                    </PpPill>
                  </div>
                ))}
              </div>
            )}
          </PpCard>
        </div>
      </div>
    </div>
  );
}
