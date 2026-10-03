'use client';

import React, { useState } from 'react';
import { Shield, Users, FileText, CheckCircle2, AlertTriangle, Key } from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';
import { PpCard, PpTable, PpPill, PpEmptyState } from '@/components/pastel/primitives';

export type PlatformStatus = 'connected' | 'degraded' | 'disconnected' | 'pending' | 'unverified';

export interface ConnectedPlatform {
  name: string;
  type: string;
  status: PlatformStatus;
  accounts: string;
  syncRate: string;
  scopes: string[];
  expiresIn: string;
}

export type MemberStatus = 'active' | 'invited' | 'suspended' | 'offline';

export interface GovernanceMember {
  name: string;
  initials: string;
  email?: string;
  role: 'Agency Admin' | 'Media Buyer' | 'Experimenter' | 'Client Viewer';
  lastActive: string;
  status?: MemberStatus;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  status: 'success' | 'warning' | 'error';
}

export interface AccountGovernanceHubProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  initialPlatforms?: ConnectedPlatform[];
  initialMembers?: GovernanceMember[];
  initialAuditLogs?: AuditLogEntry[];
}

export function AccountGovernanceHub({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  initialPlatforms,
  initialMembers,
  initialAuditLogs,
}: AccountGovernanceHubProps) {
  const platforms = initialPlatforms ?? [];
  const members = initialMembers ?? [];
  const auditLogs = initialAuditLogs ?? [];
  const [activeTab, setActiveTab] = useState<'connections' | 'rbac' | 'audit'>('connections');

  const connectedCount = platforms.filter((p) => p.status === 'connected').length;
  const degradedCount = platforms.filter((p) => p.status === 'degraded').length;
  const unverifiedCount = platforms.filter((p) => p.status === 'unverified' || p.status === 'pending').length;

  const content = (
    <div className="space-y-6" data-testid="account-governance-hub">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-pp-outline">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-pp-on-surface">Settings &amp; Governance</span>
          </div>
          <h2 className="mt-1 font-pp-display text-xl font-bold tracking-tight text-pp-on-surface sm:text-2xl">
            Account Governance, Ad Connections &amp; Audit Logs
          </h2>
          <p className="mt-0.5 text-xs text-pp-on-surface-variant sm:text-sm">
            Platform OAuth credential status, role-based access control matrix, and complete immutable audit trails.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <PpPill
            accent={
              degradedCount > 0
                ? 'amber'
                : connectedCount > 0
                  ? 'mint'
                  : 'neutral'
            }
            dot
          >
            {connectedCount > 0
              ? `${connectedCount} Connected APIs${degradedCount > 0 ? ` (${degradedCount} Degraded)` : ''}`
              : unverifiedCount > 0
                ? `${unverifiedCount} Pending Verification`
                : 'No APIs Connected'}
          </PpPill>
          <span className="rounded-full border border-pp-outline-variant/40 bg-pp-surface-container-lowest px-3 py-1 text-xs font-semibold text-pp-on-surface shadow-pp-candy">
            RBAC Active
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-pp-outline-variant/30 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('connections')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'connections'
              ? 'border-pp-primary text-pp-primary'
              : 'border-transparent text-pp-outline hover:text-pp-on-surface'
          }`}
        >
          Connected Platforms ({platforms.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rbac')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'rbac'
              ? 'border-pp-primary text-pp-primary'
              : 'border-transparent text-pp-outline hover:text-pp-on-surface'
          }`}
        >
          Team &amp; RBAC Matrix ({members.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`pb-3 border-b-2 transition-all ${
            activeTab === 'audit'
              ? 'border-pp-primary text-pp-primary'
              : 'border-transparent text-pp-outline hover:text-pp-on-surface'
          }`}
        >
          Audit Trail Log ({auditLogs.length})
        </button>
      </div>

      {/* Tab 1: Connected Platforms */}
      {activeTab === 'connections' && (
        <div>
          {platforms.length === 0 ? (
            <PpEmptyState
              icon={Key}
              title="No Connected Platforms"
              description="No external marketing APIs or data ingestion credentials are configured for this organization."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {platforms.map((platform) => (
                <div
                  key={platform.name}
                  className="flex flex-col justify-between rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-lowest p-5 shadow-pp-candy"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-pp-display text-base font-bold text-pp-on-surface">{platform.name}</h3>
                        <span className="text-xs text-pp-outline">{platform.type}</span>
                      </div>
                      <PpPill
                        accent={
                          platform.status === 'connected'
                            ? 'mint'
                            : platform.status === 'degraded'
                              ? 'amber'
                              : platform.status === 'pending' || platform.status === 'unverified'
                                ? 'neutral'
                                : 'error'
                        }
                        dot
                      >
                        {platform.status === 'connected'
                          ? 'Connected'
                          : platform.status === 'degraded'
                            ? 'Degraded'
                            : platform.status === 'unverified'
                              ? 'Unverified'
                              : platform.status === 'pending'
                                ? 'Pending'
                                : 'Disconnected'}
                      </PpPill>
                    </div>

                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-pp-outline">Accounts:</span>
                        <span className="font-semibold text-pp-on-surface">{platform.accounts}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-pp-outline">Sync Rate:</span>
                        <span className="font-mono text-pp-on-surface">{platform.syncRate}</span>
                      </div>
                      <div className="pt-1">
                        <span className="text-[11px] text-pp-outline">Scopes:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {platform.scopes.map((s) => (
                            <span
                              key={s}
                              className="rounded bg-pp-surface-container px-1.5 py-0.5 font-mono text-[10px] text-pp-on-surface-variant"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-pp-outline-variant/20 pt-3 text-xs">
                    <span className="text-[11px] text-pp-outline">{platform.expiresIn}</span>
                    <button
                      type="button"
                      className="rounded-lg bg-pp-primary-fixed px-2.5 py-1 text-xs font-semibold text-pp-on-primary-fixed hover:opacity-90 transition-opacity"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Team & RBAC */}
      {activeTab === 'rbac' && (
        <div className="space-y-6">
          {/* Role hierarchy breakdown */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div className="rounded-xl border border-pp-outline-variant/30 bg-pp-surface-container-lowest p-3 shadow-pp-candy">
              <strong className="block text-pp-primary font-bold">Agency Admin</strong>
              <span className="text-[11px] text-pp-outline">Global root access &amp; billing</span>
            </div>
            <div className="rounded-xl border border-pp-outline-variant/30 bg-pp-surface-container-lowest p-3 shadow-pp-candy">
              <strong className="block text-pp-secondary font-bold">Media Buyer</strong>
              <span className="text-[11px] text-pp-outline">Budget edits &amp; ad guardrails</span>
            </div>
            <div className="rounded-xl border border-pp-outline-variant/30 bg-pp-surface-container-lowest p-3 shadow-pp-candy">
              <strong className="block text-teal-700 dark:text-teal-400 font-bold">Experimenter</strong>
              <span className="text-[11px] text-pp-outline">A/B tests &amp; DOM editor</span>
            </div>
            <div className="rounded-xl border border-pp-outline-variant/30 bg-pp-surface-container-lowest p-3 shadow-pp-candy">
              <strong className="block text-pp-outline font-bold">Client Viewer</strong>
              <span className="text-[11px] text-pp-outline">Read-only dashboards</span>
            </div>
          </div>

          {members.length === 0 ? (
            <PpEmptyState
              icon={Users}
              title="No Team Members Found"
              description="No members are currently linked to this organization."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-lowest shadow-pp-candy">
              <PpTable>
                <thead>
                  <tr className="border-b border-pp-outline-variant/20 bg-pp-surface-container/30 text-start text-xs font-semibold text-pp-outline">
                    <th className="py-3 px-4">MEMBER</th>
                    <th className="py-3 px-4">ASSIGNED ROLE</th>
                    <th className="py-3 px-4">STATUS</th>
                    <th className="py-3 px-4">LAST ACTIVE</th>
                    <th className="py-3 px-4 text-end">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pp-outline-variant/20 text-xs">
                  {members.map((m) => (
                    <tr key={m.name} className="transition-colors hover:bg-pp-surface-container/20">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-pp-primary-fixed font-bold text-xs text-pp-on-primary-fixed">
                            {m.initials}
                          </div>
                          <div>
                            <span className="font-semibold text-pp-on-surface">{m.name}</span>
                            {m.email && <span className="block text-[11px] text-pp-outline">{m.email}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-pp-on-surface">{m.role}</td>
                      <td className="py-3 px-4">
                        <PpPill
                          accent={
                            m.status === 'active'
                              ? 'mint'
                              : m.status === 'invited'
                                ? 'amber'
                                : m.status === 'suspended'
                                  ? 'error'
                                  : 'neutral'
                          }
                          dot
                        >
                          {m.status === 'active'
                            ? 'Active'
                            : m.status === 'invited'
                              ? 'Invited'
                              : m.status === 'suspended'
                                ? 'Suspended'
                                : m.status === 'offline'
                                  ? 'Offline'
                                  : 'Active'}
                        </PpPill>
                      </td>
                      <td className="py-3 px-4 text-pp-outline">{m.lastActive}</td>
                      <td className="py-3 px-4 text-end text-pp-outline">Manage</td>
                    </tr>
                  ))}
                </tbody>
              </PpTable>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Audit Trail Log */}
      {activeTab === 'audit' && (
        <div>
          {auditLogs.length === 0 ? (
            <PpEmptyState
              icon={FileText}
              title="No Audit Logs Recorded"
              description="No administrative or automated actions have been recorded in the organization audit ledger yet."
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-pp-outline-variant/30 bg-pp-surface-container-lowest shadow-pp-candy">
              <PpTable>
                <thead>
                  <tr className="border-b border-pp-outline-variant/20 bg-pp-surface-container/30 text-start text-xs font-semibold text-pp-outline">
                    <th className="py-3 px-4">TIME</th>
                    <th className="py-3 px-4">ACTOR</th>
                    <th className="py-3 px-4">ACTION EXECUTED</th>
                    <th className="py-3 px-4">TARGET RESOURCE</th>
                    <th className="py-3 px-4 text-end">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pp-outline-variant/20 text-xs">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-pp-surface-container/20">
                      <td className="py-3 px-4 font-mono text-pp-outline">{log.timestamp}</td>
                      <td className="py-3 px-4 font-semibold text-pp-on-surface">{log.actor}</td>
                      <td className="py-3 px-4 text-pp-on-surface">{log.action}</td>
                      <td className="py-3 px-4 font-mono text-pp-outline">{log.target}</td>
                      <td className="py-3 px-4 text-end">
                        <PpPill
                          accent={
                            log.status === 'success' ? 'mint' : log.status === 'warning' ? 'amber' : 'error'
                          }
                          dot
                        >
                          {log.status === 'success' ? 'Executed' : log.status === 'warning' ? 'Warning' : 'Failed'}
                        </PpPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PpTable>
            </div>
          )}
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
