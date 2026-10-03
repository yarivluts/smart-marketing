'use client';

import React, { useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  DollarSign,
  Flame,
  Handshake,
  Rocket,
  Timer,
  TrendingUp,
  UserCheck,
  Zap,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';

export interface HotLead {
  id: string;
  name: string;
  domain: string;
  intentScore: number;
  signals: string;
  seats: string;
  repName?: string;
  repAvatarInitials?: string;
  claimed: boolean;
}

export interface HotLeadsRadarProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
  onClaimLead?: (lead: HotLead) => Promise<void> | void;
}

const DEFAULT_LEADS: HotLead[] = [
  {
    id: 'lead-1',
    name: 'Crestview Law Firm',
    domain: 'crestviewlaw.com',
    intentScore: 98,
    signals: 'Uploaded 14 PDFs, 8 signers invited in 48h',
    seats: '25-50 Seats',
    repName: 'Alex K.',
    repAvatarInitials: 'AK',
    claimed: true,
  },
  {
    id: 'lead-2',
    name: 'Apex Real Estate Holdings',
    domain: 'apexholdings.io',
    intentScore: 94,
    signals: 'Hit Free Tier limit in 3 days; invited 4 team members',
    seats: '50-100 Seats',
    repName: 'Sarah C.',
    repAvatarInitials: 'SC',
    claimed: true,
  },
  {
    id: 'lead-3',
    name: 'Horizon Financial Group',
    domain: 'horizonfg.net',
    intentScore: 89,
    signals: 'Sent 6 multi-party security agreements',
    seats: '10-25 Seats',
    claimed: false,
  },
  {
    id: 'lead-4',
    name: 'Vanguard Biopharma',
    domain: 'vanguardbio.org',
    intentScore: 91,
    signals: 'Configured SSO SAML integration in sandbox',
    seats: '100+ Seats',
    claimed: false,
  },
];

export function HotLeadsRadar({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
  onClaimLead,
}: HotLeadsRadarProps) {
  const [leads, setLeads] = useState<HotLead[]>(DEFAULT_LEADS);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleClaim = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, claimed: true, repName: 'You (Claimed)' } : l))
    );
    setActionSuccess(leadId);
    setTimeout(() => setActionSuccess(null), 3000);

    if (onClaimLead && lead) {
      void onClaimLead(lead);
    } else if (lead && orgId && projectId && orgId !== 'demo-org') {
      void fetch(`/api/orgs/${orgId}/projects/${projectId}/rep-collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: lead.name,
          collectionType: 'other',
          amount: 500,
          occurredAt: new Date().toISOString(),
          note: `Claimed PQL lead ${lead.name} (${lead.domain})`,
        }),
      }).catch((err) => console.error('Failed to persist claimed lead', err));
    }
  };

  const content = (
    <div className="space-y-8" data-testid="hot-leads-radar">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>GrowthOS</span>
            <span>&gt;</span>
            <span className="text-foreground">Sales Pipeline</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Sales Acceleration, Demo Velocity & Hot Inbound Leads
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            High-intent product qualified leads (PQLs) detected via live telemetry and inbound demo scoring.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-95 transition-all"
        >
          <Zap className="h-4 w-4" />
          Book New Demo
        </button>
      </div>

      {/* 4 Pipeline Velocity Scorecards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">38 Active Deals</span>
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Inbound Pipeline Value
          </p>
          <div className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            $142,500
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Qualified inbound opportunities
          </div>
        </div>

        {/* Card 2 */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <Rocket className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600">
              <ArrowUpRight className="h-3 w-3" />
              +8.4%
            </span>
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Self-Serve Conversion
          </p>
          <div className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            64.2%
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Pure PLG Velocity</div>
        </div>

        {/* Card 3 */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
              <Handshake className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">Avg: $4,800/yr</span>
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Sales-Assisted Win Rate
          </p>
          <div className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            38.5%
          </div>
          <div className="mt-3 text-xs text-muted-foreground">High-touch deal velocity</div>
        </div>

        {/* Card 4 */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
              <Timer className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600">
              -2.1 days
            </span>
          </div>
          <p className="mt-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Median Time to Close
          </p>
          <div className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            4.8 Days
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Faster vs last quarter</div>
        </div>
      </div>

      {/* Main Grid: Hot Leads Radar (2 Cols) & Cohort Efficiency (1 Col) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Hot Leads Table (Left 2 cols) */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:col-span-2">
          <div className="border-b border-border p-5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-rose-500 animate-pulse" />
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  High-Intent "Hot Leads" Radar
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Trial accounts with &gt;5 documents executed in 48 hours primed for annual conversion.
              </p>
            </div>
            <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-bold text-rose-600">
              4 PQLs Ready
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  <th className="py-3.5 px-5 font-semibold">LEAD / COMPANY</th>
                  <th className="py-3.5 px-4 font-semibold">INTENT SCORE</th>
                  <th className="py-3.5 px-4 font-semibold">TRIAL USAGE SIGNALS</th>
                  <th className="py-3.5 px-4 font-semibold">SEATS</th>
                  <th className="py-3.5 px-4 font-semibold">OWNER</th>
                  <th className="py-3.5 px-5 font-semibold text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {leads.map((lead) => (
                  <tr key={lead.id} className="transition-colors hover:bg-muted/40">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary">
                          {lead.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{lead.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {lead.domain}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-700 dark:text-amber-400">
                        {lead.intentScore}/100 🔥
                      </span>
                    </td>

                    <td className="py-4 px-4 text-muted-foreground max-w-xs">{lead.signals}</td>
                    <td className="py-4 px-4 font-semibold text-foreground">{lead.seats}</td>

                    <td className="py-4 px-4">
                      {lead.claimed ? (
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                          {lead.repName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">Unassigned</span>
                      )}
                    </td>

                    <td className="py-4 px-5 text-right">
                      {actionSuccess === lead.id ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                          <CheckCircle2 className="h-4 w-4" /> Claimed!
                        </span>
                      ) : lead.claimed ? (
                        <button
                          type="button"
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-all shadow-xs"
                        >
                          ⚡ Reach Out
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleClaim(lead.id)}
                          className="rounded-lg border border-primary px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 transition-all"
                        >
                          Claim Lead
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Acquisition Cohort Efficiency Summary (Right 1 col) */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="text-base font-bold tracking-tight text-foreground">
                Inbound Demo Funnel
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Conversion rate through sales qualification milestones.
            </p>

            <div className="mt-6 space-y-4 text-xs">
              <div>
                <div className="flex justify-between font-semibold">
                  <span>Demos Scheduled</span>
                  <span className="font-mono font-bold">124</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-purple-500" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-semibold">
                  <span>Demos Completed (Show Rate 88%)</span>
                  <span className="font-mono font-bold">109</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: '88%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-semibold">
                  <span>Proposals Sent (68%)</span>
                  <span className="font-mono font-bold">74</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: '68%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between font-semibold">
                  <span>Deals Closed Won (38.5%)</span>
                  <span className="font-mono font-bold text-emerald-600">42</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: '38.5%' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
            ⚡ Overall Demo-to-Paid Win Rate: <strong className="text-foreground">33.8%</strong>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <MissingIntegrationOverlay
      orgId={orgId}
      projectId={projectId}
      isMissing={!isDataConnected}
      connectorId="hubspot"
      metricKey="DEMOS_PIPELINE"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
