'use client';

import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import type { NotificationSettingsData } from './settings-types';

export interface NotificationSettingsCardProps {
  initialSettings?: NotificationSettingsData;
  onSave?: (settings: NotificationSettingsData) => void;
  className?: string;
}

export const DEFAULT_NOTIFICATIONS: NotificationSettingsData = {
  emailAlerts: true,
  slackAlerts: false,
  budgetOverrunAlerts: true,
  goalRiskAlerts: true,
  winRuleAlerts: true,
  weeklyDigest: true,
};

export function NotificationSettingsCard({
  initialSettings = DEFAULT_NOTIFICATIONS,
  onSave,
  className = '',
}: NotificationSettingsCardProps): React.ReactElement {
  const [settings, setSettings] = useState<NotificationSettingsData>(initialSettings);

  const toggle = (key: keyof NotificationSettingsData) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    onSave?.(updated);
  };

  return (
    <div
      data-testid="notification-settings-card"
      className={`flex flex-col gap-6 rounded-2xl border border-border/80 bg-card p-6 shadow-xs ${className}`}
    >
      <div className="flex flex-col gap-1 pb-4 border-b border-border/60">
        <h3 className="text-lg font-bold tracking-tight text-foreground">
          Alerts & Notifications
        </h3>
        <p className="text-xs text-muted-foreground">
          Control real-time notifications for ad budget guardrails, goal risks, and team win celebrations.
        </p>
      </div>

      <div className="flex flex-col gap-4 text-xs">
        {/* Budget Overruns */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
          <div>
            <span className="font-semibold text-foreground">Budget Guardrail Alerts</span>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Instant notification when daily campaign spend reaches 90% of maximum quota.
            </p>
          </div>
          <Switch
            checked={settings.budgetOverrunAlerts}
            onCheckedChange={() => toggle('budgetOverrunAlerts')}
          />
        </div>

        {/* Goal Risk Alert */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
          <div>
            <span className="font-semibold text-foreground">Goal Pace Risk Alerts</span>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Receive notifications when linear pace falls behind target expectations.
            </p>
          </div>
          <Switch
            checked={settings.goalRiskAlerts}
            onCheckedChange={() => toggle('goalRiskAlerts')}
          />
        </div>

        {/* Win Rule Celebrations */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
          <div>
            <span className="font-semibold text-foreground">Win Rule Triggers</span>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Live broadcast when a high-value customer deal or significant conversion occurs.
            </p>
          </div>
          <Switch
            checked={settings.winRuleAlerts}
            onCheckedChange={() => toggle('winRuleAlerts')}
          />
        </div>

        {/* Weekly Executive Digest */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20">
          <div>
            <span className="font-semibold text-foreground">Weekly Executive Summary</span>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Every Monday at 08:00 AM UTC: blended spend, CAC, ROAS, and conversion funnel report.
            </p>
          </div>
          <Switch
            checked={settings.weeklyDigest}
            onCheckedChange={() => toggle('weeklyDigest')}
          />
        </div>
      </div>
    </div>
  );
}
