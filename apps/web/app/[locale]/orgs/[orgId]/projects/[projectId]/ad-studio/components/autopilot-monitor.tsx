'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
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

  const channels = [
    {
      id: 'meta',
      nameKey: 'channelMeta',
      spend: 2450,
      share: 49,
      roas: 3.8,
      status: 'Scaling (+12%)',
      statusVariant: 'success',
    },
    {
      id: 'google',
      nameKey: 'channelGoogle',
      spend: 1650,
      share: 33,
      roas: 3.2,
      status: 'Steady',
      statusVariant: 'neutral',
    },
    {
      id: 'tiktok',
      nameKey: 'channelTiktok',
      spend: 650,
      share: 13,
      roas: 2.1,
      status: 'Pacing Capped',
      statusVariant: 'warning',
    },
    {
      id: 'linkedin',
      nameKey: 'channelLinkedin',
      spend: 250,
      share: 5,
      roas: 2.7,
      status: 'Testing',
      statusVariant: 'neutral',
    },
  ];

  const fatigueAlerts = [
    {
      id: 'fa-1',
      adTitle: 'Summer Growth Hack V2 (Reels 9:16)',
      frequency: 4.8,
      ctrDrop: '-38%',
      actionKey: 'fatigueActionReplaced',
      actionVariant: 'success',
      timestamp: '28m ago',
    },
    {
      id: 'fa-2',
      adTitle: 'Legacy Spreadsheet Chaos (Feed 1:1)',
      frequency: 5.6,
      ctrDrop: '-46%',
      actionKey: 'fatigueActionPaused',
      actionVariant: 'danger',
      timestamp: '2h ago',
    },
    {
      id: 'fa-3',
      adTitle: 'Enterprise ROI Demo (Web 16:9)',
      frequency: 3.9,
      ctrDrop: '-18%',
      actionKey: 'fatigueActionPending',
      actionVariant: 'warning',
      timestamp: '4h ago',
    },
  ];

  const [ledgerItems, setLedgerItems] = useState<ActionLedgerItem[]>([
    {
      id: 'act-1',
      timestamp: '14:22:05',
      action: 'Shifted $450 from TikTok to Meta Reels',
      reason: 'ROAS surpassed 3.8x with +15% conversion volume surge',
      impact: '+$1,710 Projected Revenue',
      channel: 'Meta Reels',
    },
    {
      id: 'act-2',
      timestamp: '12:05:18',
      action: 'Auto-paused adset #CR-104 (Spreadsheet Chaos)',
      reason: 'Fatigue threshold triggered: frequency > 5.2 and CTR drop > 40%',
      impact: 'Protected $320 daily burn',
      channel: 'Google RSA',
    },
    {
      id: 'act-3',
      timestamp: '09:41:50',
      action: 'Scaled daily budget pacing by +10%',
      reason: 'Morning CPA beat target ceiling ($24.80 vs $32.00 threshold)',
      impact: '+24 Qualified Signups',
      channel: 'Meta Feed',
    },
  ]);

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
    <div className="space-y-8">
      {/* Header Pipeline Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-[#7064F4]" />
            <h2 className="text-xl font-bold text-[#181820]">
              {t('autopilotTitle')}
            </h2>
          </div>
          <p className="mt-1 text-sm text-[#6B6A78]">
            {t('autopilotSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              autopilotActive && !killSwitchTriggered
                ? 'bg-[#E6FAF5] text-[#0E624C]'
                : 'bg-[#FFF1F1] text-[#D63031]'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                autopilotActive && !killSwitchTriggered
                  ? 'animate-pulse bg-[#55EFC4]'
                  : 'bg-[#FF5252]'
              }`}
            />
            {autopilotActive && !killSwitchTriggered
              ? t('systemStatusHealthy')
              : 'Autopilot Inactive / Paused'}
          </span>

          <button
            type="button"
            onClick={handleToggleAutopilot}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all ${
              autopilotActive
                ? 'bg-[#ECE8F6] text-[#181820] hover:bg-[#EBE9FD]'
                : 'bg-[#7064F4] text-white hover:bg-[#5243D5]'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            <span>{autopilotActive ? t('autopilotPaused') : t('btnResumeAutopilot')}</span>
          </button>

          {!killSwitchTriggered ? (
            <button
              type="button"
              onClick={handleKillSwitch}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF1F1] px-4 py-2 text-xs font-bold text-[#D63031] transition-all hover:bg-[#FF7675] hover:text-white"
            >
              <Power className="h-3.5 w-3.5" />
              <span>{t('btnEmergencyKill')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleResetKillSwitch}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#E6FAF5] px-4 py-2 text-xs font-bold text-[#0E624C] transition-all hover:bg-[#55EFC4]"
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
        <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#7064F4]" />
              <h3 className="text-base font-bold text-[#181820]">
                {t('spendGuardrailsTitle')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingGuardrails((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-full bg-[#ECE8F6] px-3 py-1 text-xs font-semibold text-[#181820] transition-colors hover:bg-[#EBE9FD]"
            >
              <Sliders className="h-3 w-3" />
              <span>{isEditingGuardrails ? 'Close' : t('btnAdjustGuardrails')}</span>
            </button>
          </div>
          <p className="mt-1 text-xs text-[#6B6A78]">
            {t('spendGuardrailsDesc')}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            {/* Daily Cap */}
            <div className="rounded-xl bg-[#F5F3FB]/70 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9B99A8]">
                {t('dailyCapLabel')}
              </span>
              {isEditingGuardrails ? (
                <div className="mt-1 flex items-center">
                  <span className="text-sm font-bold text-[#181820]">$</span>
                  <input
                    type="number"
                    value={dailyCap}
                    onChange={(e) => setDailyCap(Number(e.target.value))}
                    className="w-24 rounded-md border border-[#ECE8F6] bg-white px-2 py-0.5 text-base font-bold text-[#181820]"
                  />
                </div>
              ) : (
                <p className="mt-1 text-2xl font-extrabold text-[#181820]">
                  ${dailyCap.toLocaleString()}
                </p>
              )}
              <span className="text-[11px] text-[#6B6A78]">Hard spend ceiling</span>
            </div>

            {/* Min ROAS Floor */}
            <div className="rounded-xl bg-[#F5F3FB]/70 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9B99A8]">
                {t('minRoasFloorLabel')}
              </span>
              {isEditingGuardrails ? (
                <div className="mt-1 flex items-center">
                  <input
                    type="number"
                    step="0.1"
                    value={minRoasFloor}
                    onChange={(e) => setMinRoasFloor(Number(e.target.value))}
                    className="w-20 rounded-md border border-[#ECE8F6] bg-white px-2 py-0.5 text-base font-bold text-[#181820]"
                  />
                  <span className="text-sm font-bold text-[#181820] ms-1">x</span>
                </div>
              ) : (
                <p className="mt-1 text-2xl font-extrabold text-[#0E624C]">
                  {minRoasFloor}x
                </p>
              )}
              <span className="text-[11px] text-[#6B6A78]">Trigger auto-pause if below</span>
            </div>

            {/* Max CPA Ceiling */}
            <div className="rounded-xl bg-[#F5F3FB]/70 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9B99A8]">
                {t('maxCpaCeilingLabel')}
              </span>
              {isEditingGuardrails ? (
                <div className="mt-1 flex items-center">
                  <span className="text-sm font-bold text-[#181820]">$</span>
                  <input
                    type="number"
                    value={maxCpaCeiling}
                    onChange={(e) => setMaxCpaCeiling(Number(e.target.value))}
                    className="w-20 rounded-md border border-[#ECE8F6] bg-white px-2 py-0.5 text-base font-bold text-[#181820]"
                  />
                </div>
              ) : (
                <p className="mt-1 text-2xl font-extrabold text-[#181820]">
                  ${maxCpaCeiling}
                </p>
              )}
              <span className="text-[11px] text-[#6B6A78]">Target acquisition limit</span>
            </div>

            {/* Max Shift Velocity */}
            <div className="rounded-xl bg-[#F5F3FB]/70 p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9B99A8]">
                {t('reallocationVelocityLabel')}
              </span>
              <p className="mt-1 text-2xl font-extrabold text-[#5243D5]">
                15%
              </p>
              <span className="text-[11px] text-[#6B6A78]">Cap per 4-hour evaluation cycle</span>
            </div>
          </div>
        </div>

        {/* Channel Spend Allocation Card */}
        <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#181820]">
              {t('pacingDistributionTitle')}
            </h3>
            <span className="text-xs font-semibold text-[#6B6A78]">
              $5,000 Total Active
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {channels.map((ch) => (
              <div key={ch.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#181820]">
                    {t(ch.nameKey as any)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-[#181820]">
                      ${ch.spend.toLocaleString()} ({ch.share}%)
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        ch.statusVariant === 'success'
                          ? 'bg-[#E6FAF5] text-[#0E624C]'
                          : ch.statusVariant === 'warning'
                          ? 'bg-[#FFF6E5] text-[#684805]'
                          : 'bg-[#ECE8F6] text-[#6B6A78]'
                      }`}
                    >
                      {ch.status}
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#ECE8F6]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7064F4] to-[#55EFC4]"
                    style={{ width: `${ch.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Creative Fatigue Radar Alerts Section */}
      <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#FDCB6E]" />
              <h3 className="text-base font-bold text-[#181820]">
                {t('fatigueAlertsTitle')}
              </h3>
            </div>
            <p className="mt-1 text-xs text-[#6B6A78]">
              {t('fatigueAlertsDesc')}
            </p>
          </div>
          <span className="rounded-full bg-[#FFF6E5] px-3 py-1 text-xs font-bold text-[#684805]">
            3 Active Wear-Out Alerts
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {fatigueAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ECE8F6] bg-[#F5F3FB]/40 p-4 transition-colors hover:bg-white"
            >
              <div>
                <h4 className="text-sm font-bold text-[#181820]">
                  {alert.adTitle}
                </h4>
                <div className="mt-1 flex items-center gap-3 text-xs text-[#6B6A78]">
                  <span>Frequency: <strong className="text-[#181820]">{alert.frequency}x</strong></span>
                  <span>7d CTR Delta: <strong className="text-[#D63031]">{alert.ctrDrop}</strong></span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {alert.timestamp}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                    alert.actionVariant === 'success'
                      ? 'bg-[#E6FAF5] text-[#0E624C]'
                      : alert.actionVariant === 'danger'
                      ? 'bg-[#FFF1F1] text-[#D63031]'
                      : 'bg-[#FFF6E5] text-[#684805]'
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {t(alert.actionKey as any)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Autonomous Action Audit Ledger */}
      <div className="rounded-2xl border border-[#ECE8F6] bg-white p-6 shadow-[0_8px_24px_-4px_rgba(112,100,244,0.08)]">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[#7064F4]" />
          <h3 className="text-base font-bold text-[#181820]">
            {t('executionLedgerTitle')}
          </h3>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-[#ECE8F6] text-[11px] font-semibold uppercase tracking-wider text-[#9B99A8]">
                <th className="pb-3 text-start">Timestamp</th>
                <th className="pb-3 text-start">Autonomous Action</th>
                <th className="pb-3 text-start">Trigger Rationale</th>
                <th className="pb-3 text-start">Observed Impact</th>
                <th className="pb-3 text-start">Target Channel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECE8F6]/60 text-xs">
              {ledgerItems.map((item) => (
                <tr key={item.id} className="hover:bg-[#F5F3FB]/50 transition-colors">
                  <td className="py-3 font-mono text-[#6B6A78]">
                    {item.timestamp}
                  </td>
                  <td className="py-3 font-bold text-[#181820]">
                    {item.action}
                  </td>
                  <td className="py-3 text-[#6B6A78]">
                    {item.reason}
                  </td>
                  <td className="py-3 font-semibold text-[#0E624C]">
                    {item.impact}
                  </td>
                  <td className="py-3">
                    <span className="rounded-md bg-[#ECE8F6] px-2 py-0.5 font-medium text-[#181820]">
                      {item.channel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
