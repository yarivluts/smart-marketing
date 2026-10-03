'use client';

import React, { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Shield,
  ShieldAlert,
  TrendingDown,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import { PageGuideButton } from '@/components/guides/page-guide-button';

export interface GuardrailRule {
  id: string;
  name: string;
  condition: string;
  action: string;
  isEnabled: boolean;
  lastTriggered?: string;
  category: 'roas' | 'fatigue' | 'bleed' | 'uptime';
}

export interface SafetyIntervention {
  id: string;
  timestamp: string;
  condition: string;
  entityName: string;
  platform: 'meta' | 'google' | 'tiktok';
  action: string;
  status: 'success' | 'failed' | 'overridden';
  savedBudget: string;
}

export interface SpendProtectionConsoleProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  missingConnectors?: string[];
  initialKillSwitchActive?: boolean;
  initialRules?: GuardrailRule[];
  onTriggerKillSwitch?: (active: boolean) => void | Promise<void>;
  onToggleRule?: (ruleId: string, enabled: boolean) => void | Promise<void>;
}

const DEFAULT_RULES: GuardrailRule[] = [
  {
    id: 'roas-floor',
    name: 'ROAS Floor Protection',
    condition: 'If 24h Spend > $500 AND Verified ROAS < 2.0x',
    action: 'Pause Campaign & Notify Slack',
    isEnabled: true,
    lastTriggered: '2h ago',
    category: 'roas',
  },
  {
    id: 'fatigue-breaker',
    name: 'Creative Fatigue Breaker',
    condition: 'CTR Drops > 30% AND Frequency > 4.5',
    action: 'Rotate to Backup Creatives',
    isEnabled: true,
    lastTriggered: 'Yesterday',
    category: 'fatigue',
  },
  {
    id: 'bleed-guard',
    name: 'No-Conversion Bleed Guard',
    condition: 'Spend > $200 AND Conversions = 0 in 6h',
    action: 'Pause Ad Set & Emergency Alert',
    isEnabled: false,
    lastTriggered: '3 days ago',
    category: 'bleed',
  },
  {
    id: 'error-shield',
    name: 'Landing Page Error Shield',
    condition: 'HTTP 5xx / 4xx error detected on destination URL',
    action: 'Halt Traffic & Divert to Fallback',
    isEnabled: true,
    lastTriggered: 'Oct 12',
    category: 'uptime',
  },
];

const DEFAULT_INTERVENTIONS: SafetyIntervention[] = [
  {
    id: 'int-1',
    timestamp: 'Today, 14:23',
    condition: 'ROAS < 1.5x on $2k Spend',
    entityName: 'Retargeting_V2_Video',
    platform: 'meta',
    action: 'Paused Campaign',
    status: 'success',
    savedBudget: '$1,420 saved',
  },
  {
    id: 'int-2',
    timestamp: 'Today, 09:12',
    condition: 'Creative Fatigue (CTR drop 34%)',
    entityName: 'Founder_Story_UGC',
    platform: 'tiktok',
    action: 'Rotated to Backup Variant C',
    status: 'success',
    savedBudget: '$680 saved',
  },
  {
    id: 'int-3',
    timestamp: 'Yesterday, 18:40',
    condition: 'Zero-Conversion Bleed ($240 spend)',
    entityName: 'Search_Competitor_Broad',
    platform: 'google',
    action: 'Paused Ad Group',
    status: 'success',
    savedBudget: '$950 saved',
  },
];

export function SpendProtectionConsole({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  missingConnectors = [],
  initialKillSwitchActive,
  initialRules,
  onTriggerKillSwitch,
  onToggleRule,
}: SpendProtectionConsoleProps) {
  const [killSwitchActive, setKillSwitchActive] = useState<boolean>(initialKillSwitchActive ?? false);
  const [rules, setRules] = useState<GuardrailRule[]>(initialRules ?? DEFAULT_RULES);
  const [interventions, setInterventions] = useState<SafetyIntervention[]>(DEFAULT_INTERVENTIONS);
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);
  const [killSwitchReason, setKillSwitchReason] = useState<string>('Emergency Traffic Halt requested by operator');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const applyKillSwitchMutation = async (active: boolean, reason?: string) => {
    if (orgId && orgId !== 'demo-org') {
      try {
        await fetch(`/api/orgs/${orgId}/automation/kill-switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            engaged: active,
            ...(active ? { reason: reason || killSwitchReason.trim() || 'Triggered from Spend Protection Console' } : {}),
          }),
        });
      } catch (err) {
        console.error('Failed to persist kill switch state', err);
      }
    }
  };

  const toggleKillSwitch = () => {
    if (!killSwitchActive) {
      setConfirmModalOpen(true);
    } else {
      setKillSwitchActive(false);
      onTriggerKillSwitch?.(false);
      void applyKillSwitchMutation(false);
    }
  };

  const confirmActivateKillSwitch = () => {
    const trimmedReason = killSwitchReason.trim();
    if (!trimmedReason) {
      setReasonError('A reason is required to engage the kill switch.');
      return;
    }
    setReasonError(null);
    setKillSwitchActive(true);
    setConfirmModalOpen(false);
    onTriggerKillSwitch?.(true);
    void applyKillSwitchMutation(true, trimmedReason);
  };

  const handleToggleRule = (ruleId: string) => {
    setRules((prev) => {
      const updatedRules = prev.map((r) => {
        if (r.id === ruleId) {
          const updated = !r.isEnabled;
          onToggleRule?.(ruleId, updated);
          return { ...r, isEnabled: updated };
        }
        return r;
      });

      if (orgId && projectId && orgId !== 'demo-org') {
        const activeIds = updatedRules.filter((r) => r.isEnabled).map((r) => r.id);
        void fetch(`/api/orgs/${orgId}/projects/${projectId}/automation/guardrail-policy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ protectedTargetIds: activeIds }),
        }).catch((err) => console.error('Failed to update guardrail policy', err));
      }

      return updatedRules;
    });
  };

  const handleResumeIntervention = (interventionId: string) => {
    setInterventions((prev) =>
      prev.map((item) => (item.id === interventionId ? { ...item, status: 'overridden' } : item))
    );
  };

  const consoleContent = (
    <div className="space-y-8" data-testid="spend-protection-console">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>GrowthOS</span>
          <span>&gt;</span>
          <span className="text-foreground">Spend Protection & Safety</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Automated Spend Guardrails & Emergency Console
          </h1>
          <PageGuideButton pageKey="cost-guardrails" />
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Autonomous circuit breakers protecting ad capital across Google Ads, Meta Ads, and TikTok.
        </p>
      </div>

      {/* Emergency Kill Switch Hero Banner */}
      <section
        className={`relative overflow-hidden rounded-2xl border p-6 transition-all sm:p-8 ${
          killSwitchActive
            ? 'border-rose-500 bg-rose-500/15 shadow-rose-500/20 shadow-xl'
            : 'border-rose-500/30 bg-rose-500/10 shadow-sm'
        }`}
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertOctagon
                className={`h-6 w-6 ${killSwitchActive ? 'text-rose-500 animate-bounce' : 'text-rose-600'}`}
              />
              <h2 className="text-xl font-bold text-foreground sm:text-2xl">
                Emergency Kill Switch
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  killSwitchActive
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                }`}
              >
                {killSwitchActive ? 'TRAFFIC HALTED' : 'READY / STANDBY'}
              </span>
            </div>
            <p className="max-w-2xl text-xs text-muted-foreground sm:text-sm">
              Instantly pauses all live campaigns across connected ad networks (Google, Meta,
              TikTok) via parallel high-speed API mutations in case of checkout outages or site downtime.
            </p>
          </div>

          {/* Action Trigger */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleKillSwitch}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold shadow-md transition-all active:scale-[0.98] ${
                killSwitchActive
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-rose-600 text-white hover:bg-rose-700'
              }`}
            >
              {killSwitchActive ? (
                <>
                  <PlayCircle className="h-5 w-5" />
                  Resume All Ad Campaigns
                </>
              ) : (
                <>
                  <PauseCircle className="h-5 w-5" />
                  Halt All Paid Traffic Now
                </>
              )}
            </button>
          </div>
        </div>

        {/* Confirmation Modal */}
        {confirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="flex items-center gap-3 text-rose-600">
                <AlertTriangle className="h-6 w-6" />
                <h3 className="text-lg font-bold">Confirm Emergency Halt</h3>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                This will immediately pause <strong>all active ad groups</strong> across Google,
                Meta, and TikTok. Are you sure you want to halt all paid traffic?
              </p>
              <div className="mt-4 space-y-1.5 text-left">
                <label htmlFor="kill-switch-reason-input" className="text-xs font-semibold text-foreground">
                  Halt Reason (Required)
                </label>
                <input
                  id="kill-switch-reason-input"
                  type="text"
                  value={killSwitchReason}
                  onChange={(e) => {
                    setKillSwitchReason(e.target.value);
                    if (e.target.value.trim()) setReasonError(null);
                  }}
                  placeholder="e.g. Budget overrun, abnormal CPA surge, broken landing page"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {reasonError && <p className="text-xs text-rose-600">{reasonError}</p>}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmModalOpen(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmActivateKillSwitch}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
                >
                  Yes, Halt All Traffic
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Active Guardrails Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold tracking-tight text-foreground">Active Guardrails</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {rules.filter((r) => r.isEnabled).length} of {rules.length} Rules Active
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-sm transition-all hover:shadow-md ${
                rule.isEnabled ? 'border-primary/30' : 'border-border opacity-70'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        rule.category === 'roas'
                          ? 'bg-purple-500/10 text-purple-600'
                          : rule.category === 'fatigue'
                          ? 'bg-blue-500/10 text-blue-600'
                          : rule.category === 'bleed'
                          ? 'bg-rose-500/10 text-rose-600'
                          : 'bg-emerald-500/10 text-emerald-600'
                      }`}
                    >
                      {rule.category === 'roas' && <TrendingDown className="h-5 w-5" />}
                      {rule.category === 'fatigue' && <RotateCcw className="h-5 w-5" />}
                      {rule.category === 'bleed' && <Ban className="h-5 w-5" />}
                      {rule.category === 'uptime' && <ShieldAlert className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{rule.name}</h3>
                      <span className="text-[11px] text-muted-foreground">
                        {rule.isEnabled ? 'Active Protection' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.isEnabled}
                    onClick={() => handleToggleRule(rule.id)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      rule.isEnabled ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        rule.isEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                      CONDITION
                    </span>
                    <span className="text-foreground">{rule.condition}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                      ACTION
                    </span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      {rule.action}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last triggered: {rule.lastTriggered || 'Never'}
                </span>
                <span className="font-medium text-primary">Auto-Enforced</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Execution Audit Log (Bottom) */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold tracking-tight text-foreground">
              Automated Safety Interventions Log
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">Live Telemetry</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="py-3 px-5 font-semibold">TIMESTAMP</th>
                <th className="py-3 px-5 font-semibold">TRIGGER CONDITION</th>
                <th className="py-3 px-5 font-semibold">AFFECTED ENTITY</th>
                <th className="py-3 px-5 font-semibold">ACTION TAKEN</th>
                <th className="py-3 px-5 font-semibold">ESTIMATED SAVE</th>
                <th className="py-3 px-5 font-semibold text-right">OVERRIDE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {interventions.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-muted/40">
                  <td className="py-3.5 px-5 font-mono text-muted-foreground whitespace-nowrap">
                    {item.timestamp}
                  </td>
                  <td className="py-3.5 px-5 font-medium text-foreground">{item.condition}</td>
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          item.platform === 'meta'
                            ? 'bg-blue-500/10 text-blue-600'
                            : item.platform === 'google'
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-purple-500/10 text-purple-600'
                        }`}
                      >
                        {item.platform.toUpperCase()}
                      </span>
                      <span className="font-mono text-xs">{item.entityName}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {item.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {item.savedBudget}
                  </td>
                  <td className="py-3.5 px-5 text-right">
                    {item.status === 'overridden' ? (
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Resumed
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleResumeIntervention(item.id)}
                        className="rounded-lg border border-border px-3 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        Resume
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  return (
    <MissingIntegrationOverlay
      orgId={orgId}
      projectId={projectId}
      isMissing={!isDataConnected}
      connectorId={missingConnectors[0] || 'google_ads'}
      metricKey="ROI"
    >
      {consoleContent}
    </MissingIntegrationOverlay>
  );
}
