'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Play,
  Search,
  Video,
  Zap,
} from 'lucide-react';
import { MissingIntegrationOverlay } from '@/components/integrations/missing-integration-overlay';

export interface SdkDeploymentWizardProps {
  orgId?: string;
  projectId?: string;
  isDataConnected?: boolean;
}

export function SdkDeploymentWizard({
  orgId = 'demo-org',
  projectId = 'demo-project',
  isDataConnected = true,
}: SdkDeploymentWizardProps) {
  const [copied, setCopied] = useState(false);
  const [syncScope, setSyncScope] = useState<'90d' | '12m' | '24m'>('12m');
  const [connectedMeta, setConnectedMeta] = useState(false);
  const [connectedTikTok, setConnectedTikTok] = useState(false);

  const snippet = `<script src="https://cdn.growthos.io/v1/loader.js" data-growthos-id="GOS-8942-X" data-anti-flicker="true" async></script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const content = (
    <div className="space-y-10" data-testid="sdk-deployment-wizard">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Connect Your Paid Media & Deployment Stack
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          GrowthOS pairs client-side visual experimentation with bidirectional ad network attribution and automated cost guardrails.
        </p>
      </div>

      {/* Section A: SDK Deployment Verification */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          A. Client-Side SDK Deployment Verification
        </h2>

        <div className="relative rounded-xl bg-slate-950 p-4 font-mono text-xs text-slate-100 overflow-x-auto">
          <code>{snippet}</code>
          <button
            type="button"
            onClick={handleCopy}
            className="absolute top-3 right-3 rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition-colors flex items-center gap-1"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy Snippet
              </>
            )}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-primary" />
            14KB footprint • sub-20ms edge execution • Zero Core Web Vitals impact
          </div>

          <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
            <span>easysign.io</span>
            <span>•</span>
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Tag Detected on Live DOM</span>
          </div>
        </div>
      </div>

      {/* Section B: Connect Ad Accounts */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          B. Connect Ad Accounts
        </h2>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Google Ads (Connected) */}
          <div className="flex flex-col justify-between rounded-xl border-2 border-primary/20 bg-primary/5 p-5">
            <div className="flex flex-col items-center text-center">
              <div className="h-10 w-10 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center mb-3">
                <Search className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Google Ads</h3>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Read Spend & Campaigns + Automated Guardrail Write
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border/40 text-center text-[11px] text-muted-foreground">
              CID 404-892-1192
            </div>
          </div>

          {/* Meta Ads */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col items-center text-center">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center mb-3">
                <Video className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Meta Ads</h3>
              <span className="mt-1 text-xs text-muted-foreground">
                {connectedMeta ? 'Connected as marketing@easysign.io' : 'Ready to Connect'}
              </span>
            </div>

            {connectedMeta ? (
              <span className="mt-4 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-500/10 py-2 text-xs font-bold text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConnectedMeta(true)}
                className="mt-4 w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Connect Meta Ads
              </button>
            )}
          </div>

          {/* TikTok Ads */}
          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col items-center text-center">
              <div className="h-10 w-10 rounded-full bg-purple-500/10 text-purple-600 flex items-center justify-center mb-3">
                <Play className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">TikTok Ads</h3>
              <span className="mt-1 text-xs text-muted-foreground">
                {connectedTikTok ? 'Connected (adv_984210)' : 'Ready to Connect'}
              </span>
            </div>

            {connectedTikTok ? (
              <span className="mt-4 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-500/10 py-2 text-xs font-bold text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConnectedTikTok(true)}
                className="mt-4 w-full rounded-lg border border-border bg-card py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Connect TikTok Ads
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Section C: Historical Sync */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold tracking-tight text-foreground">
          C. Historical Data Sync Scope
        </h2>
        <p className="text-xs text-muted-foreground">
          Parallel batch workers ready to backfill historical ad spend, creative assets, and conversion trends.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2">
          {[
            { id: '90d', label: '90 Days (Fastest)' },
            { id: '12m', label: '12 Months', recommended: true },
            { id: '24m', label: '24 Months Deep Analysis' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSyncScope(opt.id as '90d' | '12m' | '24m')}
              className={`relative flex flex-col items-center justify-center rounded-xl p-4 text-xs font-bold transition-all ${
                syncScope === opt.id
                  ? 'border-2 border-primary bg-primary/5 text-primary shadow-sm'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.recommended && (
                <span className="absolute top-0 right-0 rounded-bl-lg bg-primary px-2 py-0.5 text-[9px] uppercase tracking-wider text-primary-foreground">
                  Recommended
                </span>
              )}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <MissingIntegrationOverlay
      orgId={orgId}
      projectId={projectId}
      isMissing={!isDataConnected}
      connectorId="growthos_sdk"
      metricKey="CONVERSION_FUNNEL"
    >
      {content}
    </MissingIntegrationOverlay>
  );
}
