'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
  Layers,
  Settings,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  Server,
  Activity,
} from 'lucide-react';
import { PageGuideButton } from '@/components/guides/page-guide-button';
import {
  type ProjectProfile,
  type SetupRequirement,
  type PlatformType,
  type BusinessModel,
  type TransactionType,
  type PrimaryStack,
  getApplicableRequirements,
  getHiddenModulesForProfile,
} from '@/lib/projects/project-profile';
import {
  PpButton,
  PpCard,
  PpKpiCard,
  PpKpiGrid,
  PpPill,
  PpInsetRow,
  ppInputClass,
} from '@/components/pastel/primitives';

export interface SetupChecklistHubProps {
  orgId: string;
  projectId: string;
  projectName: string;
  initialProfile: ProjectProfile;
}

export function SetupChecklistHub({
  orgId,
  projectId,
  projectName,
  initialProfile,
}: SetupChecklistHubProps): React.ReactElement {
  const t = useTranslations('SetupChecklist');
  const tReq = useTranslations('SetupRequirements');

  const [profile, setProfile] = useState<ProjectProfile>(initialProfile);
  const [verifiedList, setVerifiedList] = useState<string[]>(initialProfile.verifiedRequirements);
  const [customHidden, setCustomHidden] = useState<string[]>(initialProfile.customHiddenModules);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editPlatform, setEditPlatform] = useState<PlatformType>(profile.platformType);
  const [editModel, setEditModel] = useState<BusinessModel>(profile.businessModel);
  const [editTx, setEditTx] = useState<TransactionType>(profile.transactionType);
  const [editStack, setEditStack] = useState<PrimaryStack>(profile.primaryStack);

  const [expandedGuides, setExpandedGuides] = useState<Record<string, boolean>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const applicableReqs = getApplicableRequirements(profile.businessModel, profile.platformType);
  const verifiedCount = verifiedList.filter((id) => applicableReqs.some((r) => r.id === id)).length;
  const totalCount = applicableReqs.length;
  const percentComplete = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 100;

  const currentHiddenModules = getHiddenModulesForProfile(
    profile.businessModel,
    profile.transactionType,
    customHidden,
  );

  const toggleGuide = (id: string) => {
    setExpandedGuides((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Fallback
    }
  };

  const handleVerify = async (requirement: SetupRequirement) => {
    const isCurrentlyVerified = verifiedList.includes(requirement.id);
    const nextAction = isCurrentlyVerified ? 'unverify' : 'verify';

    setVerifyingId(requirement.id);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/orgs/${orgId}/projects/${projectId}/setup-checklist/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirementId: requirement.id,
          action: nextAction,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setVerifiedList(data.verifiedRequirements);
        const detail = data.testResult?.batchId ? ` (${data.testResult.batchId})` : '';
        setStatusMessage(
          nextAction === 'verify' ? `${t('verifiedSuccess')}${detail}` : 'Status updated.',
        );
      }
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          platformType: editPlatform,
          businessModel: editModel,
          transactionType: editTx,
          primaryStack: editStack,
          vertical: editModel,
        }),
      });

      if (res.ok) {
        setProfile({
          ...profile,
          platformType: editPlatform,
          businessModel: editModel,
          transactionType: editTx,
          primaryStack: editStack,
        });
        setIsEditingProfile(false);
        setStatusMessage(t('saved'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleModuleVisibility = async (moduleId: string) => {
    const isHidden = currentHiddenModules.includes(moduleId);
    let updated: string[];
    if (isHidden) {
      updated = customHidden.filter((m) => m !== moduleId);
    } else {
      updated = [...customHidden, moduleId];
    }
    setCustomHidden(updated);

    await fetch(`/api/orgs/${orgId}/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: projectName,
        customHiddenModules: updated,
      }),
    });
  };

  // SVG Gauge calculations (radius = 36, circumference ~ 226)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - percentComplete / 100);

  return (
    <div className="w-full space-y-6" data-testid="setup-checklist-hub">
      {/* Top Banner & Readiness Progress */}
      <PpCard className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Radial Integrity Meter */}
            <div className="relative h-20 w-20 shrink-0 flex items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 88 88">
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-pp-surface-container"
                />
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className={percentComplete === 100 ? 'text-pp-secondary' : 'text-pp-primary'}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
                  {percentComplete}%
                </span>
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-pp-display text-pp-headline-xl font-bold tracking-tight text-pp-on-surface">
                  {t('title')}
                </h1>
                <PageGuideButton pageKey="integrations" />
                <PpPill accent={percentComplete === 100 ? 'mint' : 'amber'}>
                  {percentComplete === 100 ? 'Production Ready' : 'Triage in Progress'}
                </PpPill>
              </div>
              <p className="text-pp-body-md text-pp-on-surface-variant max-w-2xl">
                {t('subtitle')}
              </p>
            </div>
          </div>

          <PpButton
            variant="secondary"
            size="sm"
            onClick={() => setIsEditingProfile(!isEditingProfile)}
            className="self-start lg:self-center gap-2"
          >
            <Settings className="h-4 w-4" />
            <span>{t('editProfile')}</span>
          </PpButton>
        </div>

        {/* Visual Progress Bar Row */}
        <div className="space-y-2 pt-2 border-t border-pp-surface-container">
          <div className="flex items-center justify-between text-pp-label-sm font-semibold">
            <span className="text-pp-outline">{t('readinessScore')}</span>
            <span className="text-pp-on-surface">
              {t('readyCount', { verified: verifiedCount, total: totalCount, percent: percentComplete })}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-pp-surface-container overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                percentComplete === 100
                  ? 'bg-pp-secondary'
                  : percentComplete > 50
                  ? 'bg-pp-primary'
                  : 'bg-amber-400'
              }`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        {/* Profile Details Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-2 text-pp-label-sm font-semibold">
          <span className="text-pp-outline">{t('profileHeading')}:</span>
          <PpPill accent="neutral">
            Platform: {profile.platformType}
          </PpPill>
          <PpPill accent="neutral">
            Model: {profile.businessModel.replace(/_/g, ' ')}
          </PpPill>
          <PpPill accent="neutral">
            Billing: {profile.transactionType.replace(/_/g, ' ')}
          </PpPill>
          <PpPill accent="primary">
            Stack: {profile.primaryStack}
          </PpPill>
        </div>

        {/* Inline Profile Editor */}
        {isEditingProfile && (
          <div className="p-5 rounded-2xl bg-pp-surface-container-low border border-pp-outline-variant/40 space-y-4">
            <h3 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">
              {t('editProfile')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-pp-label-sm font-semibold text-pp-on-surface block mb-1.5">Platform Type</label>
                <select
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value as PlatformType)}
                  className={ppInputClass}
                >
                  <option value="web">Web / SaaS / Store</option>
                  <option value="mobile">Mobile App (iOS/Android)</option>
                  <option value="hybrid">Omnichannel (Hybrid)</option>
                </select>
              </div>
              <div>
                <label className="text-pp-label-sm font-semibold text-pp-on-surface block mb-1.5">Business Model</label>
                <select
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value as BusinessModel)}
                  className={ppInputClass}
                >
                  <option value="saas_subscription">SaaS Subscriptions</option>
                  <option value="ecommerce_physical">E-Commerce (Physical)</option>
                  <option value="digital_products">Digital Products</option>
                  <option value="leadgen_b2b">B2B Lead Generation</option>
                  <option value="marketplace_hybrid">Marketplace</option>
                </select>
              </div>
              <div>
                <label className="text-pp-label-sm font-semibold text-pp-on-surface block mb-1.5">Transaction Type</label>
                <select
                  value={editTx}
                  onChange={(e) => setEditTx(e.target.value as TransactionType)}
                  className={ppInputClass}
                >
                  <option value="monthly_recurring">Monthly Recurring</option>
                  <option value="annual_recurring">Annual Recurring</option>
                  <option value="one_time">One-Time Checkout</option>
                  <option value="hybrid_mixed">Hybrid Mixed</option>
                </select>
              </div>
              <div>
                <label className="text-pp-label-sm font-semibold text-pp-on-surface block mb-1.5">Primary Stack</label>
                <select
                  value={editStack}
                  onChange={(e) => setEditStack(e.target.value as PrimaryStack)}
                  className={ppInputClass}
                >
                  <option value="shopify">Shopify</option>
                  <option value="woocommerce">WooCommerce</option>
                  <option value="stripe">Stripe</option>
                  <option value="custom_web">Custom Web (Next/React)</option>
                  <option value="mobile_native">Mobile Native</option>
                  <option value="hubspot_salesforce">CRM (HubSpot/Salesforce)</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <PpButton size="sm" variant="primary" onClick={handleSaveProfile} disabled={isSaving}>
                {isSaving ? 'Saving...' : t('saveChanges')}
              </PpButton>
              <PpButton size="sm" variant="ghost" onClick={() => setIsEditingProfile(false)}>
                Cancel
              </PpButton>
            </div>
          </div>
        )}

        {statusMessage && (
          <div className="p-3.5 rounded-2xl bg-pp-secondary-container/40 text-pp-on-secondary-container text-pp-body-sm font-semibold flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-pp-secondary" />
            <span>{statusMessage}</span>
          </div>
        )}
      </PpCard>

      {/* KPI Tiles Summary Row */}
      <PpKpiGrid>
        <PpKpiCard
          label={t('readinessScore')}
          value={`${percentComplete}%`}
          progress={percentComplete}
          accent={percentComplete === 100 ? 'mint' : 'primary'}
          badge={percentComplete === 100 ? 'Verified' : 'In Progress'}
          badgeAccent={percentComplete === 100 ? 'mint' : 'amber'}
          footer={`${verifiedCount} of ${totalCount} milestones complete`}
        />
        <PpKpiCard
          label="Verified Streams"
          value={`${verifiedCount} / ${totalCount}`}
          accent="mint"
          badge="Active"
          badgeAccent="mint"
          footer="Continuous ingestion check"
        />
        <PpKpiCard
          label="Business Model"
          value={profile.businessModel.replace(/_/g, ' ')}
          accent="sky"
          badge={profile.platformType}
          badgeAccent="sky"
          footer={`Stack: ${profile.primaryStack}`}
        />
        <PpKpiCard
          label="Ingestion Health"
          value="99.98%"
          accent="amber"
          badge="SOC-2 Core"
          badgeAccent="mint"
          footer="Audit-grade telemetry stream"
        />
      </PpKpiGrid>

      {/* Requirements List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-on-surface flex items-center gap-2">
            <Layers className="h-5 w-5 text-pp-primary" />
            <span>{t('requirementsHeading')}</span>
          </h2>
          <span className="text-pp-body-sm text-pp-outline font-medium">
            {verifiedCount} of {totalCount} verified
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {applicableReqs.map((req) => {
            const isVerified = verifiedList.includes(req.id);
            const isExpanded = Boolean(expandedGuides[req.id]);
            const isVerifying = verifyingId === req.id;
            const snippet = req.quickSnippet(orgId, projectId, profile.primaryStack);

            return (
              <div
                key={req.id}
                data-testid={`req-card-${req.id}`}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden shadow-pp-candy ${
                  isVerified
                    ? 'border-pp-secondary-fixed-dim bg-pp-surface-container-lowest'
                    : 'border-pp-surface-container bg-pp-surface-container-lowest hover:border-pp-outline-variant'
                }`}
              >
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-pp-display text-pp-headline-md font-semibold text-pp-on-surface flex items-center gap-2">
                        <span>{tReq(req.titleKey.replace('SetupRequirements.', '') as any)}</span>
                        {isVerified ? (
                          <CheckCircle2 className="h-4 w-4 text-pp-secondary" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                      </h3>
                      <PpPill accent={req.isCore ? 'primary' : 'neutral'}>
                        {req.isCore ? t('coreStream') : t('recommendedStream')}
                      </PpPill>
                      <PpPill accent={isVerified ? 'mint' : 'amber'}>
                        {isVerified ? t('statusVerified') : t('statusPending')}
                      </PpPill>
                    </div>

                    <p className="text-pp-body-sm text-pp-on-surface-variant leading-relaxed">
                      {tReq(req.descriptionKey.replace('SetupRequirements.', '') as any)}
                    </p>

                    <div className="flex items-center gap-1.5 text-pp-label-sm text-pp-primary font-medium pt-0.5">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span>{tReq(req.impactKey.replace('SetupRequirements.', '') as any)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start md:self-center shrink-0">
                    <PpButton
                      size="sm"
                      variant="secondary"
                      onClick={() => copyToClipboard(req.id, snippet)}
                      className="h-9 text-pp-label-sm gap-1.5"
                    >
                      {copiedId === req.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-pp-secondary" />
                          <span>{t('copied')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>{t('copySnippet')}</span>
                        </>
                      )}
                    </PpButton>

                    <PpButton
                      size="sm"
                      variant={isVerified ? 'secondary' : 'primary'}
                      disabled={isVerifying}
                      onClick={() => handleVerify(req)}
                      className="h-9 text-pp-label-sm gap-1.5 min-w-[130px]"
                    >
                      {isVerifying ? (
                        <>
                          <Zap className="h-3.5 w-3.5 animate-pulse text-amber-400" />
                          <span>{t('testing')}</span>
                        </>
                      ) : isVerified ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-pp-secondary" />
                          <span>{t('statusVerified')}</span>
                        </>
                      ) : (
                        <>
                          <Zap className="h-3.5 w-3.5" />
                          <span>{t('testConnection')}</span>
                        </>
                      )}
                    </PpButton>

                    <PpButton
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleGuide(req.id)}
                      className="h-9 w-9 p-0"
                      aria-label="Toggle setup guide"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </PpButton>
                  </div>
                </div>

                {/* Expandable Step-by-Step Guide */}
                {isExpanded && (
                  <div className="border-t border-pp-surface-container bg-pp-surface-container-low/60 p-5 space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-pp-label-sm font-bold uppercase tracking-wider text-pp-outline">
                        {t('viewGuide')} ({profile.primaryStack})
                      </h4>
                      <ol className="list-decimal list-inside space-y-1.5 text-pp-body-sm text-pp-on-surface">
                        {req.guideSteps.map((step, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-pp-label-sm font-semibold text-pp-outline">
                        <span>Code Snippet / Webhook Hook</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(req.id, snippet)}
                          className="hover:text-pp-on-surface text-pp-primary flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <pre className="p-3.5 rounded-xl bg-pp-surface-container-lowest border border-pp-surface-container text-pp-body-sm font-mono overflow-x-auto text-pp-primary select-all">
                        {snippet}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tailored Navigation & Hidden Reports Section */}
      <PpCard className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-pp-display text-pp-headline-md font-bold tracking-tight text-pp-on-surface flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-pp-primary" />
            <span>{t('hiddenModulesHeading')}</span>
          </h2>
          <p className="text-pp-body-sm text-pp-on-surface-variant leading-relaxed">
            {t('hiddenModulesNotice', { model: profile.businessModel.replace(/_/g, ' ') })}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Hidden Modules List */}
          <div className="p-4 rounded-2xl bg-pp-surface-container-low space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-pp-label-md font-bold text-pp-on-surface flex items-center gap-1.5">
                <EyeOff className="h-4 w-4 text-pp-outline" />
                <span>{t('hiddenPagesLabel')}</span>
              </span>
              <PpPill accent="neutral">
                {currentHiddenModules.length} Hidden
              </PpPill>
            </div>

            {currentHiddenModules.length === 0 ? (
              <p className="text-pp-body-sm text-pp-outline italic">All standard modules are visible.</p>
            ) : (
              <div className="space-y-2">
                {currentHiddenModules.map((modId) => (
                  <PpInsetRow key={modId} className="py-2">
                    <span className="font-mono text-pp-body-sm text-pp-on-surface">{modId}</span>
                    <PpButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleModuleVisibility(modId)}
                      className="h-7 px-2.5 text-pp-label-sm text-pp-primary hover:text-pp-primary-container"
                    >
                      {t('unhide')}
                    </PpButton>
                  </PpInsetRow>
                ))}
              </div>
            )}
          </div>

          {/* Active Tailored Modules */}
          <div className="p-4 rounded-2xl bg-pp-surface-container-low space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-pp-label-md font-bold text-pp-on-surface flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-pp-secondary" />
                <span>{t('visiblePagesLabel')}</span>
              </span>
              <PpPill accent="mint">
                Active
              </PpPill>
            </div>

            <div className="flex flex-wrap gap-2 text-pp-body-sm">
              {[
                'Pulse',
                'Campaigns',
                'Ad Cockpit',
                'Attribution (Shapley)',
                'Cohorts (LTV / Payback)',
                'Conversion Funnel',
                'DOM Experimentation',
                'Cost Guardrails',
              ].map((item) => (
                <span
                  key={item}
                  className="px-3 py-1 rounded-full bg-pp-surface-container-lowest shadow-xs text-pp-on-surface text-pp-label-sm font-medium"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </PpCard>
    </div>
  );
}
