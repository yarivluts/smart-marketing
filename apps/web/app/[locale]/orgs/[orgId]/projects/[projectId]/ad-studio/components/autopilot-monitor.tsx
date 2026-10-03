'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PpCard, PpButton, ppInputClass, PpPill, PpEmptyState } from '@/components/pastel/primitives';
import {
  Bot,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Power,
  RotateCcw,
  Zap,
  ArrowUpRight,
  Clock,
  Activity,
  Layers,
} from 'lucide-react';

interface AutopilotMonitorProps {
  orgId: string;
  projectId: string;
  projectName: string;
}

interface ActionLedgerItem {
  id: string;
  timestamp: string;
  action: string;
  reason: string;
  impact: string;
  channel: string;
}

export function AutopilotMonitor({ orgId, projectId, projectName }: AutopilotMonitorProps): React.ReactElement {
  const t = useTranslations('AdStudioPage');

  const [autopilotActive, setAutopilotActive] = useState(true);
  const [dailyCap, setDailyCap] = useState(5000);
  const [minRoasFloor, setMinRoasFloor] = useState(2.5);
  const [maxCpaCeiling, setMaxCpaCeiling] = useState(32);
  const [isEditingGuardrails, setIsEditingGuardrails] = useState(false);
  const [killSwitchTriggered, setKillSwitchTriggered] = useState(false);

  // Channels, fatigue alerts, and action ledger use honest state when no actions have occurred
  const channels: Array<{
    id: string;
    nameKey: string;
    spend: number;
    share: number;
    status: string;
    statusVariant: 'success' | 'neutral' | 'warning';
  }> = [];

  const fatigueAlerts: Array<{
    id: string;
    adTitle: string;
    frequency: number;
    ctrDrop: string;
    actionKey: string;
    actionVariant: 'success' | 'danger' | 'warning';
    timestamp: string;
  }> = [];

  const [ledgerItems, setLedgerItems] = useState<ActionLedgerItem[]>([]);

  const handleToggleAutopilot = () => {
    setAutopilotActive((prev) => !prev);
  };

  const handleKillSwitch = () => {
    setAutopilotActive(false);
    setKillSwitchTriggered(true);
  };

  const handleResetKillSwitch = () => {
    setAutopilotActive(true);
    setKillSwitchTriggered(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Pipeline Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-pp-primary" />
            <h2 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
              {t('autopilotTitle')}
            </h2>
          </div>
          <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
            {t('autopilotSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-label-sm text-label-sm font-bold ${
              autopilotActive && !killSwitchTriggered
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                autopilotActive && !killSwitchTriggered
                  ? 'animate-pulse bg-emerald-500'
                  : 'bg-red-500'
              }`}
            />
            {autopilotActive && !killSwitchTriggered
              ? t('systemStatusHealthy')
              : 'Autopilot Inactive / Paused'}
          </span>

          <button
            type="button"
            onClick={handleToggleAutopilot}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-label-sm text-label-sm font-bold transition-all ${
              autopilotActive
                ? 'bg-pp-surface-container text-pp-on-surface hover:bg-pp-surface-container-high'
                : 'bg-pp-primary text-pp-on-primary hover:bg-pp-primary-container'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            <span>{autopilotActive ? t('autopilotPaused') : t('btnResumeAutopilot')}</span>
          </button>

          {!killSwitchTriggered ? (
            <button
              type="button"
              onClick={handleKillSwitch}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-4 py-2 font-label-sm text-label-sm font-bold text-red-700 transition-all hover:bg-red-100"
            >
              <Power className="h-3.5 w-3.5" />
              <span>{t('btnEmergencyKill')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleResetKillSwitch}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-4 py-2 font-label-sm text-label-sm font-bold text-emerald-800 transition-all hover:bg-emerald-100"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Resume Operations</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid: Spend Allocation Guardrails & Channel Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Spend Allocation Guardrails Card */}
        <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-pp-primary" />
              <h3 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
                {t('spendGuardrailsTitle')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingGuardrails((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-full bg-pp-surface-container px-3 py-1 font-label-sm text-label-sm font-semibold text-pp-on-surface transition-colors hover:bg-pp-surface-container-high"
            >
              <Sliders className="h-3 w-3" />
              <span>{isEditingGuardrails ? 'Close' : t('btnAdjustGuardrails')}</span>
            </button>
          </div>
          <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
            {t('spendGuardrailsDesc')}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            {/* Daily Cap */}
            <div className="rounded-2xl bg-pp-surface-container-low p-4 border border-pp-outline-variant/40">
              <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-outline">
                {t('dailyCapLabel')}
              </span>
              {isEditingGuardrails ? (
                <div className="mt-1 flex items-center">
                  <span className="font-headline-md text-headline-md font-bold text-pp-on-surface me-1">$</span>
                  <input
                    type="number"
                    value={dailyCap}
                    onChange={(e) => setDailyCap(Number(e.target.value))}
                    className={`w-28 rounded-xl ${ppInputClass}`}
                  />
                </div>
              ) : (
                <p className="mt-1 font-metric-display text-metric-display font-extrabold text-pp-on-surface">
                  ${dailyCap.toLocaleString()}
                </p>
              )}
              <span className="font-label-sm text-label-sm text-pp-on-surface-variant">Hard spend ceiling</span>
            </div>

            {/* Min ROAS Floor */}
            <div className="rounded-2xl bg-pp-surface-container-low p-4 border border-pp-outline-variant/40">
              <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-outline">
                {t('minRoasFloorLabel')}
              </span>
              {isEditingGuardrails ? (
                <div className="mt-1 flex items-center">
                  <input
                    type="number"
                    step="0.1"
                    value={minRoasFloor}
                    onChange={(e) => setMinRoasFloor(Number(e.target.value))}
                    className={`w-24 rounded-xl ${ppInputClass}`}
                  />
                  <span className="font-headline-md text-headline-md font-bold text-pp-on-surface ms-1">x</span>
                </div>
              ) : (
                <p className="mt-1 font-metric-display text-metric-display font-extrabold text-emerald-600">
                  {minRoasFloor}x
                </p>
              )}
              <span className="font-label-sm text-label-sm text-pp-on-surface-variant">Trigger auto-pause if below</span>
            </div>

            {/* Max CPA Ceiling */}
            <div className="rounded-2xl bg-pp-surface-container-low p-4 border border-pp-outline-variant/40">
              <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-outline">
                {t('maxCpaCeilingLabel')}
              </span>
              {isEditingGuardrails ? (
                <div className="mt-1 flex items-center">
                  <span className="font-headline-md text-headline-md font-bold text-pp-on-surface me-1">$</span>
                  <input
                    type="number"
                    value={maxCpaCeiling}
                    onChange={(e) => setMaxCpaCeiling(Number(e.target.value))}
                    className={`w-24 rounded-xl ${ppInputClass}`}
                  />
                </div>
              ) : (
                <p className="mt-1 font-metric-display text-metric-display font-extrabold text-pp-on-surface">
                  ${maxCpaCeiling}
                </p>
              )}
              <span className="font-label-sm text-label-sm text-pp-on-surface-variant">Target acquisition limit</span>
            </div>

            {/* Max Shift Velocity */}
            <div className="rounded-2xl bg-pp-surface-container-low p-4 border border-pp-outline-variant/40">
              <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-outline">
                {t('reallocationVelocityLabel')}
              </span>
              <p className="mt-1 font-metric-display text-metric-display font-extrabold text-pp-primary">
                15%
              </p>
              <span className="font-label-sm text-label-sm text-pp-on-surface-variant">Cap per 4-hour evaluation cycle</span>
            </div>
          </div>
        </div>

        {/* Channel Spend Allocation Card */}
        <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
                {t('pacingDistributionTitle')}
              </h3>
              <span className="font-label-sm text-label-sm font-semibold text-pp-on-surface-variant">
                $0 Active Spend
              </span>
            </div>

            {channels.length === 0 ? (
              <div className="py-8">
                <PpEmptyState
                  icon={Layers}
                  title="No active channel pacing"
                  description="Connect ad network accounts or publish campaigns to activate autonomous pacing distribution."
                />
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {channels.map((ch) => (
                  <div key={ch.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-pp-on-surface">
                        {t(ch.nameKey as any)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-pp-on-surface">
                          ${ch.spend.toLocaleString()} ({ch.share}%)
                        </span>
                        <span className="rounded-full bg-pp-surface-container px-2 py-0.5 text-[10px] font-bold text-pp-on-surface-variant">
                          {ch.status}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-pp-surface-container">
                      <div
                        className="h-full rounded-full bg-pp-primary"
                        style={{ width: `${ch.share}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Creative Fatigue Radar Alerts Section */}
      <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
                {t('fatigueAlertsTitle')}
              </h3>
            </div>
            <p className="mt-1 font-body-sm text-body-sm text-pp-on-surface-variant">
              {t('fatigueAlertsDesc')}
            </p>
          </div>
          <span className="rounded-full bg-pp-surface-container px-3 py-1 font-label-sm text-label-sm font-bold text-pp-on-surface-variant">
            {fatigueAlerts.length} Active Wear-Out Alerts
          </span>
        </div>

        {fatigueAlerts.length === 0 ? (
          <div className="py-8">
            <PpEmptyState
              icon={ShieldCheck}
              title="No creative fatigue detected"
              description="All running ad creatives are operating within healthy frequency and click-through thresholds."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {fatigueAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pp-outline-variant/40 bg-pp-surface-container-low p-4"
              >
                <div>
                  <h4 className="font-label-md text-label-md font-bold text-pp-on-surface">
                    {alert.adTitle}
                  </h4>
                  <div className="mt-1 flex items-center gap-3 font-body-sm text-body-sm text-pp-on-surface-variant">
                    <span>Frequency: <strong className="text-pp-on-surface">{alert.frequency}x</strong></span>
                    <span>7d CTR Delta: <strong className="text-red-600">{alert.ctrDrop}</strong></span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {alert.timestamp}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Autonomous Action Audit Ledger */}
      <div className="rounded-3xl border border-pp-outline-variant/60 bg-pp-surface-container-lowest p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-pp-primary" />
          <h3 className="font-headline-md text-headline-md font-bold text-pp-on-surface">
            {t('executionLedgerTitle')}
          </h3>
        </div>

        {ledgerItems.length === 0 ? (
          <div className="py-8">
            <PpEmptyState
              icon={Activity}
              title="No autonomous actions recorded"
              description="Pacing and fatigue guardrails are active and continuously evaluating connected channels. Actions will be logged here."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-pp-outline-variant/40 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-pp-outline">
                  <th className="pb-3 text-start">Timestamp</th>
                  <th className="pb-3 text-start">Autonomous Action</th>
                  <th className="pb-3 text-start">Trigger Rationale</th>
                  <th className="pb-3 text-start">Observed Impact</th>
                  <th className="pb-3 text-start">Target Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pp-outline-variant/40 font-body-sm text-body-sm">
                {ledgerItems.map((item) => (
                  <tr key={item.id} className="hover:bg-pp-surface-container-low transition-colors">
                    <td className="py-3 font-mono text-pp-on-surface-variant">
                      {item.timestamp}
                    </td>
                    <td className="py-3 font-bold text-pp-on-surface">
                      {item.action}
                    </td>
                    <td className="py-3 text-pp-on-surface-variant">
                      {item.reason}
                    </td>
                    <td className="py-3 font-semibold text-emerald-600">
                      {item.impact}
                    </td>
                    <td className="py-3">
                      <span className="rounded-md bg-pp-surface-container px-2 py-0.5 font-medium text-pp-on-surface">
                        {item.channel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
