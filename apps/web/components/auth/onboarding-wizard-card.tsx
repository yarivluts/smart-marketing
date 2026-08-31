'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Layers,
  Globe,
  Check,
  Loader2,
  PartyPopper,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';

export interface OnboardingWizardCardProps {
  initialStep?: number;
  initialProjectName?: string;
  initialVertical?: string;
  orgId?: string;
  projectId?: string;
  onComplete?: (data: {
    projectName: string;
    vertical: string;
    packId: string;
    connectedSources: string[];
  }) => Promise<void> | void;
  className?: string;
}

export function OnboardingWizardCard({
  initialStep = 1,
  initialProjectName = 'My Growth Workspace',
  initialVertical = 'SaaS & Software',
  orgId,
  projectId,
  onComplete,
  className,
}: OnboardingWizardCardProps): React.ReactElement {
  const locale = useLocale();
  const isRtl = locale === 'he';
  const router = useRouter();

  const [currentStep, setCurrentStep] = React.useState(initialStep);
  const [projectName, setProjectName] = React.useState(initialProjectName);
  const [vertical, setVertical] = React.useState(initialVertical);
  const [selectedPack, setSelectedPack] = React.useState('saas_marketing');
  const [connectedSources, setConnectedSources] = React.useState<string[]>(['meta_ads', 'google_ads']);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [nameError, setNameError] = React.useState<string | null>(null);

  const steps = [
    { id: 1, label: locale === 'he' ? 'הגדרת סביבה' : 'Workspace' },
    { id: 2, label: locale === 'he' ? 'חבילת מדדים' : 'Metric Pack' },
    { id: 3, label: locale === 'he' ? 'חיבור מקורות' : 'Data Sources' },
    { id: 4, label: locale === 'he' ? 'סיום והפעלה' : 'Ready' },
  ];

  const metricPacks = [
    {
      id: 'saas_marketing',
      title: locale === 'he' ? 'SaaS & שיווק ביצועים' : 'SaaS & Performance Marketing',
      desc: locale === 'he' ? 'מעקב CAC, LTV, MRR, המרות ומשפך רישום' : 'Ad spend, signups, CAC, MRR, and conversion velocity',
      badge: 'Recommended',
    },
    {
      id: 'ecommerce',
      title: locale === 'he' ? 'איקומרס וקניות' : 'E-Commerce & Retail',
      desc: locale === 'he' ? 'ROAS, גודל עגלה ממוצע, ערך חיי לקוח ונטישת עגלה' : 'ROAS, AOV, checkout drop-offs, and repeat orders',
      badge: 'Popular',
    },
    {
      id: 'lead_gen',
      title: locale === 'he' ? 'יצירת לידים ושירותים' : 'Lead Gen & B2B Services',
      desc: locale === 'he' ? 'עלות לליד מוסמך, פגישות הדגמה ושיעורי סגירה' : 'Qualified leads, CPA, SQL conversion, and pipeline speed',
      badge: 'High Intent',
    },
  ];

  const availableSources = [
    { id: 'meta_ads', name: 'Meta Ads (Facebook & Instagram)', tag: 'Advertising' },
    { id: 'google_ads', name: 'Google Ads (Search & RSA)', tag: 'Search' },
    { id: 'stripe', name: 'Stripe Payments & Billing', tag: 'Revenue' },
    { id: 'custom_api', name: 'GrowthOS Ingestion API', tag: 'Developer API' },
  ];

  function toggleSource(id: string) {
    setConnectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function handleNextStep() {
    if (currentStep === 1) {
      if (!projectName.trim()) {
        setNameError(locale === 'he' ? 'שם סביבת העבודה הוא שדה חובה' : 'Workspace name is required');
        return;
      }
      setNameError(null);
    }
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  }

  function handlePrevStep() {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  }

  async function handleFinish() {
    setIsSubmitting(true);
    try {
      if (onComplete) {
        await onComplete({
          projectName,
          vertical,
          packId: selectedPack,
          connectedSources,
        });
      }
      if (orgId && projectId) {
        router.push(`/orgs/${orgId}/projects/${projectId}/automation`);
      } else {
        router.push('/dashboard');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const progressPct = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div
      data-testid="onboarding-wizard-container"
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        'mx-auto w-full max-w-2xl rounded-3xl border border-border/80 bg-card p-6 sm:p-10 shadow-soft-xl',
        className,
      )}
    >
      {/* Step Indicator & Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground mb-3">
          <span>
            {locale === 'he' ? `שלב ${currentStep} מתוך ${steps.length}` : `Step ${currentStep} of ${steps.length}`}
          </span>
          <span className="text-primary font-bold">{Math.round(progressPct)}%</span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
            style={{ width: `${Math.max(progressPct, 5)}%` }}
          />
        </div>

        {/* Step Breadcrumb Pills */}
        <div className="mt-4 flex items-center justify-between">
          {steps.map((step) => {
            const isDone = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            return (
              <div key={step.id} className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all',
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/20'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : step.id}
                </div>
                <span
                  className={cn(
                    'hidden sm:inline text-xs font-medium',
                    isCurrent ? 'text-foreground font-bold' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 1: Workspace Setup */}
      {currentStep === 1 && (
        <div data-testid="onboarding-step-1" className="space-y-5 animate-fade-in">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {locale === 'he' ? 'הגדרת סביבת העבודה שלך' : 'Set up your Growth Workspace'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {locale === 'he'
                ? 'תן שם לחברה או לפרויקט שלך ובחר את תחום הפעילות העיקרי.'
                : 'Give your company or project a name and choose your primary industry vertical.'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ws-name" className="text-xs font-semibold text-foreground">
                {locale === 'he' ? 'שם סביבת העבודה' : 'Workspace Name'}
              </label>
              <Input
                id="ws-name"
                data-testid="onboarding-workspace-name-input"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="e.g. Acme SaaS"
                className="h-10 rounded-xl bg-card text-xs shadow-inner"
              />
              {nameError && <span className="text-xs text-destructive">{nameError}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="ws-vertical" className="text-xs font-semibold text-foreground">
                {locale === 'he' ? 'ענף פעילות / ורטיקל' : 'Industry Vertical'}
              </label>
              <Input
                id="ws-vertical"
                data-testid="onboarding-workspace-vertical-input"
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                placeholder="e.g. LegalTech, B2B SaaS, E-Commerce"
                className="h-10 rounded-xl bg-card text-xs shadow-inner"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Metric Pack Selector */}
      {currentStep === 2 && (
        <div data-testid="onboarding-step-2" className="space-y-5 animate-fade-in">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {locale === 'he' ? 'בחר חבילת מדדי צמיחה' : 'Choose your Growth Metric Pack'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {locale === 'he'
                ? 'הגדר מראש את ה-KPIs, לוחות המחוונים ומשפך ההמרות המותאם לעסק שלך.'
                : 'Pre-configures your KPIs, dashboard charts, and conversion funnel for your business model.'}
            </p>
          </div>

          <div className="space-y-3">
            {metricPacks.map((pack) => {
              const isSelected = selectedPack === pack.id;
              return (
                <div
                  key={pack.id}
                  data-testid={`pack-card-${pack.id}`}
                  onClick={() => setSelectedPack(pack.id)}
                  className={cn(
                    'flex items-start justify-between gap-3 rounded-2xl border p-4 cursor-pointer transition-all shadow-xs',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-border/80 bg-card hover:bg-muted/30 hover:border-border',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all',
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Layers className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs text-foreground">{pack.title}</h4>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                          {pack.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{pack.desc}</p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      isSelected ? 'border-primary bg-primary text-white' : 'border-muted-foreground/40',
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Data Sources Connector */}
      {currentStep === 3 && (
        <div data-testid="onboarding-step-3" className="space-y-5 animate-fade-in">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {locale === 'he' ? 'חבר מקורות נתונים' : 'Connect Data Sources'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {locale === 'he'
                ? 'בחר את ערוצי הפרסום וההכנסות שברצונך לחבר לאופטימיזציית AI.'
                : 'Select the marketing and revenue channels to connect for AI optimization.'}
            </p>
          </div>

          <div className="space-y-3">
            {availableSources.map((source) => {
              const isConnected = connectedSources.includes(source.id);
              return (
                <div
                  key={source.id}
                  data-testid={`source-card-${source.id}`}
                  onClick={() => toggleSource(source.id)}
                  className={cn(
                    'flex items-center justify-between rounded-2xl border p-4 cursor-pointer transition-all shadow-xs',
                    isConnected
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-border/80 bg-card hover:bg-muted/30 hover:border-border',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-xl',
                        isConnected
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <Globe className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">{source.name}</h4>
                      <span className="text-[10px] text-muted-foreground">{source.tag}</span>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      isConnected
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isConnected ? (locale === 'he' ? 'מחובר' : 'Connected') : (locale === 'he' ? 'לא פעיל' : 'Disabled')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 4: Celebration & Launch Step */}
      {currentStep === 4 && (
        <div data-testid="onboarding-step-4" className="space-y-6 text-center animate-fade-in py-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-md shadow-emerald-500/20">
              <PartyPopper className="h-8 w-8 animate-bounce" />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {locale === 'he' ? 'הכל מוכן לפעולה!' : "You're all set to scale!"}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              {locale === 'he'
                ? `סביבת העבודה ${projectName} הוגדרה בהצלחה. ה-AI Copilot מוכן לייעל קמפיינים ולזהות הזדמנויות צמיחה.`
                : `Workspace "${projectName}" is ready with ${connectedSources.length} connected channels. AI Copilot is primed for optimization.`}
            </p>
          </div>

          {/* Config Summary Card */}
          <div className="rounded-2xl border border-border/80 bg-muted/40 p-4 text-start text-xs space-y-2">
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-muted-foreground">{locale === 'he' ? 'סביבת עבודה' : 'Workspace'}:</span>
              <span className="font-bold text-foreground">{projectName}</span>
            </div>
            <div className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-muted-foreground">{locale === 'he' ? 'ורטיקל' : 'Vertical'}:</span>
              <span className="font-semibold text-foreground">{vertical}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{locale === 'he' ? 'ערוצים מחוברים' : 'Active Channels'}:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{connectedSources.length} sources</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons Footer */}
      <div className="mt-8 flex items-center justify-between border-t border-border/60 pt-6">
        {currentStep > 1 && currentStep < 4 ? (
          <Button
            type="button"
            variant="outline"
            onClick={handlePrevStep}
            className="flex items-center gap-1.5 rounded-xl h-10 px-4 text-xs font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            <span>{locale === 'he' ? 'חזור' : 'Back'}</span>
          </Button>
        ) : (
          <div />
        )}

        {currentStep < 4 ? (
          <Button
            type="button"
            data-testid="onboarding-next-button"
            onClick={handleNextStep}
            className="flex items-center gap-1.5 rounded-xl h-10 px-5 text-xs font-semibold bg-primary shadow-soft hover:bg-primary/90"
          >
            <span>{locale === 'he' ? 'המשך' : 'Continue'}</span>
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Button>
        ) : (
          <Button
            type="button"
            data-testid="onboarding-finish-button"
            disabled={isSubmitting}
            onClick={handleFinish}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl h-11 px-8 text-xs font-bold bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 transition-all active:scale-[0.98]"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>{locale === 'he' ? 'כניסה ללוח הבקרה' : 'Launch Growth Cockpit'}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
