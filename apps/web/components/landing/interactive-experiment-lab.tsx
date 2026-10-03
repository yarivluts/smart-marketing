'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Eye,
  Laptop,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';

interface ExperimentVariant {
  id: string;
  persona: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  badge: string;
  statNumber: string;
  statLabel: string;
  liftPct: string;
  confidence: string;
  edgeLatency: string;
  domPatch: string;
  accentColor: string;
}

const VARIANTS: Record<string, ExperimentVariant> = {
  b2b_saas: {
    id: 'b2b_saas',
    persona: 'B2B Enterprise SaaS',
    headline: 'Eliminate Wasted Ad Spend with Unified Revenue Attribution',
    subheadline: 'Multi-touch Shapley models connecting every Google & Meta ad click directly to signed Stripe & HubSpot deals.',
    ctaText: 'Start Enterprise POC',
    badge: 'SOC2 Type II • Multi-Touch Attribution',
    statNumber: '3.84x',
    statLabel: 'Average ROAS Lift',
    liftPct: '+28.4%',
    confidence: '99.8%',
    edgeLatency: '14ms',
    domPatch: `// Cloudflare Worker Edge Patch:
mutation.replaceText('#hero-h1', 'Eliminate Wasted Ad Spend with Unified Revenue Attribution');
mutation.replaceText('#hero-cta', 'Start Enterprise POC');
mutation.injectTag('#social-proof', '<span class="badge">SOC2 Type II</span>');`,
    accentColor: 'from-blue-600 to-indigo-600',
  },
  ecommerce: {
    id: 'ecommerce',
    persona: 'D2C E-Commerce Brand',
    headline: 'Scale Meta & TikTok ROAS with Real-Time Server CAPI Ingestion',
    subheadline: 'Recover 100% of iOS 14+ lost signals with server-side CAPI event streaming and automated creative fatigue kill-switch.',
    ctaText: 'Boost My Store ROAS',
    badge: '1-Click Shopify & CAPI Sync',
    statNumber: '18.2%',
    statLabel: 'Cart Conversion Rate',
    liftPct: '+34.1%',
    confidence: '99.5%',
    edgeLatency: '11ms',
    domPatch: `// Cloudflare Worker Edge Patch:
mutation.replaceText('#hero-h1', 'Scale Meta & TikTok ROAS with Real-Time Server CAPI');
mutation.replaceText('#hero-cta', 'Boost My Store ROAS');
mutation.injectTag('#social-proof', '<span class="badge">1-Click Shopify & CAPI Sync</span>');`,
    accentColor: 'from-emerald-500 to-teal-600',
  },
  fintech: {
    id: 'fintech',
    persona: 'High-Velocity FinTech',
    headline: 'Autonomous Cost Guardrails for Million-Dollar Ad Budgets',
    subheadline: 'Sub-second anomaly protection that automatically pauses runaway bidding campaigns before your budget burns out.',
    ctaText: 'Deploy Cost Guardrails',
    badge: 'Zero Overspend Guarantee',
    statNumber: '$142k',
    statLabel: 'Monthly Spend Protected',
    liftPct: '+22.7%',
    confidence: '99.9%',
    edgeLatency: '16ms',
    domPatch: `// Cloudflare Worker Edge Patch:
mutation.replaceText('#hero-h1', 'Autonomous Cost Guardrails for Million-Dollar Budgets');
mutation.replaceText('#hero-cta', 'Deploy Cost Guardrails');
mutation.injectTag('#social-proof', '<span class="badge">Zero Overspend Guarantee</span>');`,
    accentColor: 'from-purple-600 to-pink-600',
  },
};

export function InteractiveExperimentLab(): React.ReactElement {
  const t = useTranslations('HomePage');
  const [selectedPersona, setSelectedPersona] = useState<string>('b2b_saas');
  const [activeView, setActiveView] = useState<'preview' | 'patch'>('preview');
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  const current = VARIANTS[selectedPersona] || VARIANTS.b2b_saas;

  const handleSimulateRun = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
    }, 600);
  };

  return (
    <section id="experiment-lab" className="py-20 md:py-28 bg-background relative overflow-hidden" data-testid="interactive-experiment-lab">
      {/* Background Accent Mesh */}
      <div className="absolute top-1/3 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-center text-center mb-14">
          <Badge variant="emerald" size="sm" className="mb-3">
            <Sparkles className="h-3.5 w-3.5 me-1" />
            <span>{t('labBadge')}</span>
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            {t('labHeading')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground text-sm sm:text-base">
            {t('labSubheading')}
          </p>

          {/* Persona Selector Chips */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            <span className="text-xs font-semibold text-muted-foreground me-1">{t('labSelectPersona')}:</span>
            {[
              { id: 'b2b_saas', label: 'B2B Enterprise SaaS' },
              { id: 'ecommerce', label: 'D2C E-Commerce' },
              { id: 'fintech', label: 'FinTech Scaleup' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedPersona(p.id);
                  handleSimulateRun();
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  selectedPersona === p.id
                    ? 'bg-primary text-primary-foreground shadow-soft scale-105'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <Bot className="h-3.5 w-3.5" />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Lab Studio Window */}
        <div className="rounded-2xl border border-border/80 bg-card shadow-soft-xl overflow-hidden backdrop-blur-xl">
          {/* Top Window Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-border/60 bg-muted/40 px-6 py-3.5 gap-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-rose-500/80" />
              <span className="h-3 w-3 rounded-full bg-amber-500/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
              <span className="ms-3 text-xs font-mono text-muted-foreground font-semibold flex items-center gap-1.5">
                <Laptop className="h-3.5 w-3.5" /> edge-variant-runtime: {current.persona}
              </span>
            </div>

            {/* View Switcher & Edge Stats */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-background/80 border border-border rounded-lg p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveView('preview')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    activeView === 'preview'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{t('labViewVisual')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('patch')}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    activeView === 'patch'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  <span>{t('labViewCode')}</span>
                </button>
              </div>

              {/* Edge Speed Badge */}
              <Badge variant="emerald" dot size="sm" className="font-mono text-xs">
                {current.edgeLatency} {t('labEdgeLatency')}
              </Badge>
            </div>
          </div>

          {/* Window Main Canvas */}
          <div className="p-6 sm:p-10 relative min-h-[340px] flex items-center justify-center">
            {isSimulating && (
              <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex items-center justify-center z-20">
                <div className="flex items-center gap-2 rounded-xl bg-card border border-border px-4 py-2 shadow-lg text-xs font-bold text-foreground">
                  <RotateCcw className="h-4 w-4 animate-spin text-primary" />
                  <span>Mutating DOM at Edge...</span>
                </div>
              </div>
            )}

            {activeView === 'preview' ? (
              <div className="w-full max-w-3xl rounded-2xl border border-border/80 bg-gradient-to-br from-card to-muted/30 p-6 sm:p-10 shadow-xs text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
                {/* Variant Eyebrow */}
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1 text-xs font-bold text-foreground shadow-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{current.badge}</span>
                </div>

                {/* Variant Dynamic Headline */}
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-foreground">
                  {current.headline}
                </h3>

                {/* Variant Subheadline */}
                <p className="max-w-xl mx-auto text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {current.subheadline}
                </p>

                {/* Variant Call to Action */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Button size="lg" className={`bg-gradient-to-r ${current.accentColor} text-white shadow-soft font-bold text-xs px-6 h-10 hover:opacity-95`}>
                    <span>{current.ctaText}</span>
                    <ArrowRight className="h-3.5 w-3.5 ms-1 rtl:rotate-180" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSimulateRun} className="h-10 text-xs font-semibold">
                    <Play className="h-3.5 w-3.5 me-1 text-primary" />
                    <span>{t('labReapplyPatch')}</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-3xl rounded-xl border border-border bg-muted/70 p-6 font-mono text-xs overflow-x-auto">
                <div className="text-muted-foreground mb-2">// Edge Mutation Output: Zero Javascript Bundle Size</div>
                <pre className="text-foreground whitespace-pre-wrap leading-relaxed">{current.domPatch}</pre>
              </div>
            )}
          </div>

          {/* Bottom Live Bayesian Performance Strip */}
          <div className="border-t border-border/60 bg-muted/20 px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-4 sm:gap-8 font-mono">
              <div>
                <span className="text-muted-foreground block text-[10px]">{t('labMetricLift')}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm" dir="ltr">{current.liftPct}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">{t('labMetricConfidence')}</span>
                <span className="font-bold text-foreground text-sm" dir="ltr">{current.confidence}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">{current.statLabel}</span>
                <span className="font-bold text-primary text-sm" dir="ltr">{current.statNumber}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-muted-foreground text-[11px]">
                {t('labZeroFlickerGuarantee')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
