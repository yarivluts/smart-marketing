'use client';

import React, { useState } from 'react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';

export interface ConnectedPlatform {
  name: string;
  type: string;
  status: 'connected' | 'disconnected';
  accounts: string;
  syncRate: string;
  scopes: string[];
  expiresIn: string;
}

export interface GovernanceMember {
  name: string;
  initials: string;
  role: 'Agency Admin' | 'Media Buyer' | 'Experimenter' | 'Client Viewer';
  lastActive: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  status: 'success' | 'warning';
}

export interface AccountGovernanceHubProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialPlatforms?: ConnectedPlatform[];
  initialMembers?: GovernanceMember[];
  initialAuditLogs?: AuditLogEntry[];
}

const DEFAULT_PLATFORMS: ConnectedPlatform[] = [
  {
    name: 'Meta Graph API',
    type: 'Social Paid Media',
    status: 'connected',
    accounts: '3 Active Ad Accounts',
    syncRate: '60s polling',
    scopes: ['ads_read', 'ads_management'],
    expiresIn: '54 days',
  },
  {
    name: 'Google Ads API',
    type: 'Search & Performance Max',
    status: 'connected',
    accounts: '2 Active CID Accounts (404-892)',
    syncRate: 'Real-time Webhook',
    scopes: ['read', 'guardrail_write'],
    expiresIn: 'Active OAuth',
  },
  {
    name: 'TikTok Marketing API',
    type: 'Short-Form Video',
    status: 'connected',
    accounts: '1 Active (adv_984210)',
    syncRate: '5m polling',
    scopes: ['campaign_read', 'creative_write'],
    expiresIn: '89 days',
  },
];

const DEFAULT_MEMBERS: GovernanceMember[] = [
  { name: 'Sarah Jenkins', initials: 'SJ', role: 'Agency Admin', lastActive: 'Online now' },
  { name: 'Alex Rivera', initials: 'AR', role: 'Media Buyer', lastActive: '2h ago' },
  { name: 'Elena Rostova', initials: 'ER', role: 'Experimenter', lastActive: '1d ago' },
  { name: 'Marcus Chen', initials: 'MC', role: 'Client Viewer', lastActive: '3d ago' },
];

const DEFAULT_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'a-1',
    timestamp: '10 mins ago',
    actor: 'Autonomous Guardrail Bot',
    action: 'Auto-paused ad set #382 (ROAS < 2.0x)',
    target: 'Meta Ads: Lawyers Retargeting',
    status: 'success',
  },
  {
    id: 'a-2',
    timestamp: '1 hour ago',
    actor: 'Alex Rivera (Media Buyer)',
    action: 'Scaled daily budget from $150 to $250',
    target: 'Google Search: Brand Term PMax',
    status: 'success',
  },
  {
    id: 'a-3',
    timestamp: 'Yesterday at 16:42',
    actor: 'Sarah Jenkins (Admin)',
    action: 'Invited new Experimenter member',
    target: 'Elena Rostova (elena@partner.com)',
    status: 'success',
  },
];

export function AccountGovernanceHub({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialPlatforms,
  initialMembers,
  initialAuditLogs,
}: AccountGovernanceHubProps) {
  const [platforms, setPlatforms] = useState<ConnectedPlatform[]>(initialPlatforms && initialPlatforms.length > 0 ? initialPlatforms : DEFAULT_PLATFORMS);
  const [members, setMembers] = useState<GovernanceMember[]>(initialMembers && initialMembers.length > 0 ? initialMembers : DEFAULT_MEMBERS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(initialAuditLogs && initialAuditLogs.length > 0 ? initialAuditLogs : DEFAULT_AUDIT_LOGS);
  const [activeTab, setActiveTab] = useState<'connections' | 'rbac' | 'audit'>('connections');

  const content = (
    <div className="space-y-8" data-testid="account-governance-hub">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Settings & Governance</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Account Governance, Ad Connections & Audit Logs
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Platform OAuth credential status, role-based access control matrix, and complete immutable audit trails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 border border-emerald-500/20">
            3 Connected APIs
          </span>
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground shadow-sm">
            RBAC Active
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('connections')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'connections'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Connected Platforms (3)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rbac')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'rbac'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Team & RBAC Matrix (4)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'audit'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Audit Trail Log
        </button>
      </div>

      {/* Tab 1: Connected Platforms */}
      {activeTab === 'connections' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {platforms.map((platform) => (
            <div
              key={platform.name}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-bold text-foreground">{platform.name}</h2>
                    <span className="text-xs text-muted-foreground">{platform.type}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Connected
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Accounts:</span>
                    <span className="font-semibold text-foreground">{platform.accounts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sync Rate:</span>
                    <span className="font-mono text-foreground">{platform.syncRate}</span>
                  </div>
                  <div className="pt-2">
                    <span className="text-muted-foreground text-[11px]">Scopes:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {platform.scopes.map((s) => (
                        <span
                          key={s}
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs">
                <span className="text-[11px] text-muted-foreground">{platform.expiresIn}</span>
                <button
                  type="button"
                  className="rounded-lg bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  Manage
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Team & RBAC */}
      {activeTab === 'rbac' && (
        <div className="space-y-6">
          {/* Role hierarchy breakdown */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <strong className="block text-primary font-bold">Agency Admin</strong>
              <span className="text-[11px] text-muted-foreground">Global root access & billing</span>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <strong className="block text-secondary font-bold">Media Buyer</strong>
              <span className="text-[11px] text-muted-foreground">Budget edits & ad guardrails</span>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <strong className="block text-teal-600 font-bold">Experimenter</strong>
              <span className="text-[11px] text-muted-foreground">A/B tests & DOM editor</span>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <strong className="block text-muted-foreground font-bold">Client Viewer</strong>
              <span className="text-[11px] text-muted-foreground">Read-only dashboards</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="py-3 px-5 font-semibold">MEMBER</th>
                  <th className="py-3 px-4 font-semibold">ASSIGNED ROLE</th>
                  <th className="py-3 px-4 font-semibold">LAST ACTIVE</th>
                  <th className="py-3 px-5 font-semibold text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {members.map((m) => (
                  <tr key={m.name} className="transition-colors hover:bg-muted/40">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-bold text-xs text-primary">
                          {m.initials}
                        </div>
                        <span className="font-bold text-foreground">{m.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-foreground">{m.role}</td>
                    <td className="py-3.5 px-4 text-muted-foreground">{m.lastActive}</td>
                    <td className="py-3.5 px-5 text-right text-muted-foreground">Manage</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Audit Trail Log */}
      {activeTab === 'audit' && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="py-3 px-5 font-semibold">TIME</th>
                <th className="py-3 px-4 font-semibold">ACTOR</th>
                <th className="py-3 px-4 font-semibold">ACTION EXECUTED</th>
                <th className="py-3 px-4 font-semibold">TARGET RESOURCE</th>
                <th className="py-3 px-5 font-semibold text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {auditLogs.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-muted/40">
                  <td className="py-3.5 px-5 font-mono text-muted-foreground">{log.timestamp}</td>
                  <td className="py-3.5 px-4 font-semibold text-foreground">{log.actor}</td>
                  <td className="py-3.5 px-4 text-foreground">{log.action}</td>
                  <td className="py-3.5 px-4 font-mono text-muted-foreground">{log.target}</td>
                  <td className="py-3.5 px-5 text-right">
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-bold text-emerald-600">
                      Executed
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <MissingIntegrationOverlay
      orgId={orgId}
      projectId={projectId}
      isMissing={!isDataConnected}
      connectorId="growthos_sdk"
      metricKey="ARR"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
