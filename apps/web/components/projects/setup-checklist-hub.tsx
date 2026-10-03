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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      // Unhide
      updated = customHidden.filter((m) => m !== moduleId);
      // If it was default-hidden by profile, we can track custom allow or remove
      if (getHiddenModulesForProfile(profile.businessModel, profile.transactionType, []).includes(moduleId)) {
        // Special case: to override default hidden, we keep custom list updated
      }
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

  return (
    <div className="w-full space-y-8" data-testid="setup-checklist-hub">
      {/* Top Banner & Readiness Progress */}
      <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-card to-card/60 p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
              <PageGuideButton pageKey="integrations" />
              <Badge variant={percentComplete === 100 ? 'success' : 'amber'}>
                {percentComplete}% Complete
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">{t('subtitle')}</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditingProfile(!isEditingProfile)}
            className="self-start md:self-auto gap-2"
          >
            <Settings className="h-4 w-4" />
            {t('editProfile')}
          </Button>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-muted-foreground">{t('readinessScore')}</span>
            <span className="text-foreground">
              {t('readyCount', { verified: verifiedCount, total: totalCount, percent: percentComplete })}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                percentComplete === 100
                  ? 'bg-emerald-500'
                  : percentComplete > 50
                  ? 'bg-primary'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        {/* Profile Details Chips */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-border/50 text-xs">
          <span className="font-semibold text-muted-foreground">{t('profileHeading')}:</span>
          <Badge variant="secondary" className="capitalize">
            Platform: {profile.platformType}
          </Badge>
          <Badge variant="secondary" className="capitalize">
            Model: {profile.businessModel.replace('_', ' ')}
          </Badge>
          <Badge variant="secondary" className="capitalize">
            Billing: {profile.transactionType.replace('_', ' ')}
          </Badge>
          <Badge variant="secondary" className="capitalize">
            Stack: {profile.primaryStack}
          </Badge>
        </div>

        {/* Inline Profile Editor Modal / Drawer */}
        {isEditingProfile && (
          <div className="p-5 rounded-xl border border-primary/30 bg-primary/5 space-y-4 animate-in fade-in duration-200">
            <h3 className="text-sm font-bold text-foreground">{t('editProfile')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Platform Type</label>
                <select
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value as PlatformType)}
                  className="w-full text-xs h-9 rounded-md border border-border bg-background px-2"
                >
                  <option value="web">Web / SaaS / Store</option>
                  <option value="mobile">Mobile App (iOS/Android)</option>
                  <option value="hybrid">Omnichannel (Hybrid)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Business Model</label>
                <select
                  value={editModel}
                  onChange={(e) => setEditModel(e.target.value as BusinessModel)}
                  className="w-full text-xs h-9 rounded-md border border-border bg-background px-2"
                >
                  <option value="saas_subscription">SaaS Subscriptions</option>
                  <option value="ecommerce_physical">E-Commerce (Physical)</option>
                  <option value="digital_products">Digital Products</option>
                  <option value="leadgen_b2b">B2B Lead Generation</option>
                  <option value="marketplace_hybrid">Marketplace</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Transaction Type</label>
                <select
                  value={editTx}
                  onChange={(e) => setEditTx(e.target.value as TransactionType)}
                  className="w-full text-xs h-9 rounded-md border border-border bg-background px-2"
                >
                  <option value="monthly_recurring">Monthly Recurring</option>
                  <option value="annual_recurring">Annual Recurring</option>
                  <option value="one_time">One-Time Checkout</option>
                  <option value="hybrid_mixed">Hybrid Mixed</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Primary Stack</label>
                <select
                  value={editStack}
                  onChange={(e) => setEditStack(e.target.value as PrimaryStack)}
                  className="w-full text-xs h-9 rounded-md border border-border bg-background px-2"
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
              <Button size="sm" onClick={handleSaveProfile} disabled={isSaving}>
                {isSaving ? 'Saving...' : t('saveChanges')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditingProfile(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {statusMessage && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Requirements List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {t('requirementsHeading')}
          </h2>
          <span className="text-xs text-muted-foreground font-medium">
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
                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                  isVerified
                    ? 'border-emerald-500/40 bg-card/70 hover:border-emerald-500/60'
                    : 'border-border bg-card hover:border-border/80 shadow-sm'
                }`}
              >
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                        {tReq(req.titleKey.replace('SetupRequirements.', '') as any)}
                        {isVerified ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        )}
                      </h3>
                      <Badge variant={req.isCore ? 'default' : 'secondary'} className="text-[10px]">
                        {req.isCore ? t('coreStream') : t('recommendedStream')}
                      </Badge>
                      <Badge variant={isVerified ? 'success' : 'amber'} className="text-[10px]">
                        {isVerified ? t('statusVerified') : t('statusPending')}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {tReq(req.descriptionKey.replace('SetupRequirements.', '') as any)}
                    </p>

                    <div className="flex items-center gap-1.5 text-[11px] text-primary/90 font-medium">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span>{tReq(req.impactKey.replace('SetupRequirements.', '') as any)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start md:self-center shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(req.id, snippet)}
                      className="h-8 text-xs gap-1.5"
                    >
                      {copiedId === req.id ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          {t('copied')}
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          {t('copySnippet')}
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant={isVerified ? 'outline' : 'default'}
                      disabled={isVerifying}
                      onClick={() => handleVerify(req)}
                      className="h-8 text-xs gap-1.5 min-w-[120px]"
                    >
                      {isVerifying ? (
                        <>
                          <Zap className="h-3.5 w-3.5 animate-pulse text-amber-400" />
                          {t('testing')}
                        </>
                      ) : isVerified ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          {t('statusVerified')}
                        </>
                      ) : (
                        <>
                          <Zap className="h-3.5 w-3.5" />
                          {t('testConnection')}
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleGuide(req.id)}
                      className="h-8 px-2 text-xs"
                      aria-label="Toggle setup guide"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {/* Expandable Step-by-Step Guide */}
                {isExpanded && (
                  <div className="border-t border-border/70 bg-muted/30 p-5 space-y-4 animate-in slide-in-from-top-1 duration-200">
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t('viewGuide')} ({profile.primaryStack})
                      </h4>
                      <ol className="list-decimal list-inside space-y-1.5 text-xs text-foreground/90">
                        {req.guideSteps.map((step, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                        <span>Code Snippet / Webhook Hook</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(req.id, snippet)}
                          className="hover:text-foreground text-primary flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </button>
                      </div>
                      <pre className="p-3 rounded-lg bg-background/90 border border-border text-[11px] font-mono overflow-x-auto text-emerald-400 select-all">
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
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {t('hiddenModulesHeading')}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('hiddenModulesNotice', { model: profile.businessModel.replace('_', ' ') })}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Hidden Modules List */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <EyeOff className="h-3.5 w-3.5" />
                {t('hiddenPagesLabel')}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {currentHiddenModules.length} Hidden
              </Badge>
            </div>

            {currentHiddenModules.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">All standard modules are visible.</p>
            ) : (
              <div className="space-y-2">
                {currentHiddenModules.map((modId) => (
                  <div
                    key={modId}
                    className="flex items-center justify-between p-2 rounded-lg bg-background/80 border border-border text-xs"
                  >
                    <span className="font-mono text-muted-foreground">{modId}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleModuleVisibility(modId)}
                      className="h-6 px-2 text-[11px] text-primary"
                    >
                      {t('unhide')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Tailored Modules */}
          <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                {t('visiblePagesLabel')}
              </span>
              <Badge variant="success" className="text-[10px]">
                Active
              </Badge>
            </div>

            <div className="flex flex-wrap gap-1.5 text-[11px]">
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
                <span key={item} className="px-2.5 py-1 rounded-md bg-background border border-border text-foreground">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
