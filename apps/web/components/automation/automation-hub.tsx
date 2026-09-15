'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import {
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  History,
  Bot,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatCard } from '@/components/ui/stat-card';
import { CopilotChatPanel } from './copilot-chat-panel';
import { ProposalDiffCard, type ActionProposalData } from './proposal-diff-card';
import { ActionAuditTrail, type AuditActionItem } from './action-audit-trail';

const EMPTY_ACTIONS: AuditActionItem[] = [];
const EMPTY_PROPOSALS: ActionProposalData[] = [];

export interface AutomationHubProps {
  orgId: string;
  projectId: string;
  projectName?: string;
  killSwitchEngaged?: boolean;
  killSwitchReason?: string | null;
  actions?: AuditActionItem[];
  proposals?: ActionProposalData[];
  onExecuteProposal?: (proposal: ActionProposalData) => Promise<void> | void;
  onRollbackAction?: (actionId: string) => Promise<void> | void;
  className?: string;
}

export function AutomationHub({
  orgId,
  projectId,
  projectName = 'Workspace',
  killSwitchEngaged = false,
  killSwitchReason: _killSwitchReason,
  actions = EMPTY_ACTIONS,
  proposals = EMPTY_PROPOSALS,
  onExecuteProposal,
  onRollbackAction,
  className,
}: AutomationHubProps): React.ReactElement {
  const locale = useLocale();
  const isRtl = locale === 'he';

  const [activeTab, setActiveTab] = React.useState('copilot');
  const [localActions, setLocalActions] = React.useState<AuditActionItem[]>(actions);
  const [localProposals, setLocalProposals] = React.useState<ActionProposalData[]>(proposals);

  React.useEffect(() => {
    setLocalActions(actions);
  }, [actions]);

  // Mirrors `proposals` unconditionally. An earlier version seeded this state with two
  // invented proposals and only re-synced when the incoming array was non-empty, so a
  // project with nothing pending rendered fabricated budget changes carrying real-looking
  // figures — with a working Approve button next to them.
  React.useEffect(() => {
    setLocalProposals(proposals);
  }, [proposals]);

  async function handleApproveProposal(proposal: ActionProposalData) {
    if (onExecuteProposal) {
      await onExecuteProposal(proposal);
    }

    const newAuditItem: AuditActionItem = {
      id: proposal.id || `act-${Date.now()}`,
      targetId: proposal.targetId,
      targetLabel: proposal.targetLabel,
      actionType: proposal.actionType,
      platform: proposal.platform,
      status: 'executed',
      diffEntries: proposal.diffEntries,
      executedAt: new Date().toLocaleString(),
    };

    setLocalActions((prev) => [newAuditItem, ...prev]);
    setLocalProposals((prev) =>
      prev.map((p) => (p.targetId === proposal.targetId ? { ...p, status: 'executed' } : p)),
    );
  }

  async function handleRollbackAction(actionId: string) {
    if (onRollbackAction) {
      await onRollbackAction(actionId);
    }

    setLocalActions((prev) =>
      prev.map((act) => (act.id === actionId ? { ...act, status: 'rolled_back' } : act)),
    );
  }

  const executedCount = localActions.filter(
    (a) => a.status === 'executed' || a.status === 'verified',
  ).length;
  const pendingCount = localProposals.filter((p) => p.status === 'awaiting_approval').length;

  return (
    <div
      data-testid="action-hub"
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn('flex flex-col gap-6', className)}
    >
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-6 shadow-soft">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {locale === 'he' ? `מרכז האוטומציה וה-AI Copilot` : `AI Automation Hub`}
              </h1>
              {killSwitchEngaged ? (
                <span
                  data-testid="kill-switch-active-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-destructive/10 border border-destructive/30 px-2.5 py-0.5 text-xs font-bold text-destructive"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>{locale === 'he' ? 'מתג חירום פעיל' : 'KILL SWITCH ACTIVE'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{locale === 'he' ? 'מערכת פעילה ומאובטחת' : 'Guardrails Active'}</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {locale === 'he'
                ? `ניהול הצעות שינוי, בקרת תקציב אוטומטית ויומן פעולות עבור ${projectName}`
                : `Autonomous marketing execution, smart proposals, and instant rollback for ${projectName}`}
            </p>
          </div>
        </div>
      </div>

      {/*
        KPI Metric Summary Row. Both values are counted from the actions and proposals this
        component was actually given. There is deliberately no third "AI-Optimized Spend"
        card and no change-vs-last-week badge: the component receives no spend figure and no
        prior-period baseline, and the previous versions of both were invented constants
        ($14,850, +12.5%, +24.2%) that moved for no one and were indistinguishable from a
        real reading. A number shown here has to come from the data.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title={locale === 'he' ? 'פעולות שבוצעו' : 'Actions Executed'}
          value={executedCount}
          icon={CheckCircle2}
        />
        <StatCard
          title={locale === 'he' ? 'הצעות ממתינות' : 'Pending Proposals'}
          value={pendingCount}
          icon={Sparkles}
        />
      </div>

      {/* Main Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} variant="pills" className="w-full">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="copilot" icon={<Bot className="h-4 w-4" />}>
            {locale === 'he' ? 'AI Copilot & הצעות' : 'AI Copilot & Proposals'}
          </TabsTrigger>
          <TabsTrigger
            value="audit"
            icon={<History className="h-4 w-4" />}
            count={localActions.length}
          >
            {locale === 'he' ? 'יומן ביקורת (Audit)' : 'Audit Trail'}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Copilot & Proactive Proposals */}
        <TabsContent value="copilot" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left/Main Column: Conversational Chat Panel */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col">
              <CopilotChatPanel
                orgId={orgId}
                projectId={projectId}
                onExecuteProposal={handleApproveProposal}
                className="h-[620px]"
              />
            </div>

            {/* Right Column: Proactive Recommendation Cards */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="font-bold text-sm text-foreground">
                    {locale === 'he' ? 'הצעות פרואקטיביות' : 'Proactive Proposals'}
                  </h3>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {localProposals.filter((p) => p.status === 'awaiting_approval').length}{' '}
                  {locale === 'he' ? 'ממתינות' : 'pending'}
                </span>
              </div>

              <div className="flex flex-col gap-3 overflow-y-auto max-h-[570px] pe-1">
                {localProposals.map((proposal) => (
                  <ProposalDiffCard
                    key={proposal.id || proposal.targetId}
                    proposal={proposal}
                    onApprove={handleApproveProposal}
                    showActions={true}
                  />
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Filterable Audit Trail */}
        <TabsContent value="audit" className="mt-4">
          <ActionAuditTrail
            actions={localActions}
            onRollback={handleRollbackAction}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
