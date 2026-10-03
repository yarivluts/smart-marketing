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
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PpButton, PpPill, ppInputClass } from '@/components/pastel/primitives';
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
    { id: 1, label: locale === 'he' ? 'סביבת עבודה' : 'Workspace' },
    { id: 2, label: locale === 'he' ? 'חבילת מדדים' : 'Metric Pack' },
    { id: 3, label: locale === 'he' ? 'מקורות נתונים' : 'Data Sources' },
    { id: 4, label: locale === 'he' ? 'הפעלה וסיום' : 'Ready & Launch' },
  ];

  const metricPacks = [
    {
      id: 'saas_marketing',
      title: locale === 'he' ? 'SaaS & שיווק ביצועים' : 'SaaS & Performance Marketing',
      desc: locale === 'he' ? 'מעקב CAC, LTV, MRR, המרות ומשפך רישום' : 'Ad spend, signups, CAC, MRR, and conversion velocity',
      badge: 'Recommended',
      badgeAccent: 'primary' as const,
    },
    {
      id: 'ecommerce',
      title: locale === 'he' ? 'איקומרס וקניות' : 'E-Commerce & Retail',
      desc: locale === 'he' ? 'ROAS, גודל עגלה ממוצע, ערך חיי לקוח ונטישת עגלה' : 'ROAS, AOV, checkout drop-offs, and repeat orders',
      badge: 'Popular',
      badgeAccent: 'mint' as const,
    },
    {
      id: 'lead_gen',
      title: locale === 'he' ? 'יצירת לידים ושירותים' : 'Lead Gen & B2B Services',
      desc: locale === 'he' ? 'עלות לליד מוסמך, פגישות הדגמה ושיעורי סגירה' : 'Qualified leads, CPA, SQL conversion, and pipeline speed',
      badge: 'High Intent',
      badgeAccent: 'amber' as const,
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
        'mx-auto w-full max-w-3xl rounded-3xl bg-pp-surface-container-lowest p-6 sm:p-10 shadow-pp-candy border border-white/60 transition-all',
        className,
      )}
    >
      {/* Step Indicator & Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-pp-label-sm font-semibold text-pp-on-surface-variant mb-2">
          <span>
            {locale === 'he' ? `שלב ${currentStep} מתוך ${steps.length}` : `Step ${currentStep} of ${steps.length}`}
          </span>
          <span className="text-pp-primary font-bold">{Math.round(progressPct)}%</span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-pp-surface-container">
          <div
            className="h-full bg-pp-primary transition-all duration-300 rounded-full"
            style={{ width: `${Math.max(progressPct, 8)}%` }}
          />
        </div>

        {/* Step Breadcrumb Trail */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {steps.map((step) => {
            const isDone = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            return (
              <div key={step.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-pp-label-sm font-bold transition-all',
                    isDone
                      ? 'bg-pp-secondary text-white'
                      : isCurrent
                        ? 'bg-pp-primary text-pp-on-primary shadow-pp-candy ring-4 ring-pp-primary-fixed'
                        : 'bg-pp-surface-container text-pp-outline',
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : step.id}
                </div>
                <span
                  className={cn(
                    'text-pp-label-sm font-medium',
                    isCurrent ? 'text-pp-on-surface font-bold' : 'text-pp-outline',
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
        <div data-testid="onboarding-step-1" className="space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pp-primary-fixed text-pp-primary text-pp-label-sm font-bold mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{locale === 'he' ? 'המלצה מותאמת' : 'Adaptive Recommendation'}</span>
            </div>
            <h2 className="font-pp-display text-pp-headline-lg font-bold text-pp-on-surface">
              {locale === 'he' ? 'הגדרת סביבת העבודה שלך' : 'Set up your Growth Workspace'}
            </h2>
            <p className="text-pp-body-md text-pp-on-surface-variant mt-1">
              {locale === 'he'
                ? 'תן שם לחברה או לפרויקט שלך ובחר את תחום הפעילות העיקרי.'
                : 'Give your company or project a name and choose your primary industry vertical.'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="ws-name" className="block text-pp-label-md font-semibold text-pp-on-surface">
                {locale === 'he' ? 'שם סביבת העבודה' : 'Workspace Name'}
              </label>
              <input
                id="ws-name"
                data-testid="onboarding-workspace-name-input"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="e.g. Acme SaaS"
                className={ppInputClass}
              />
              {nameError && <p className="text-pp-body-sm text-pp-error font-medium">{nameError}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ws-vertical" className="block text-pp-label-md font-semibold text-pp-on-surface">
                {locale === 'he' ? 'ענף פעילות / ורטיקל' : 'Industry Vertical'}
              </label>
              <input
                id="ws-vertical"
                data-testid="onboarding-workspace-vertical-input"
                value={vertical}
                onChange={(e) => setVertical(e.target.value)}
                placeholder="e.g. LegalTech, B2B SaaS, E-Commerce"
                className={ppInputClass}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Metric Pack Selector */}
      {currentStep === 2 && (
        <div data-testid="onboarding-step-2" className="space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pp-primary-fixed text-pp-primary text-pp-label-sm font-bold mb-3">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{locale === 'he' ? 'חבילות מדדים מובנות' : 'Pre-Engineered Packs'}</span>
            </div>
            <h2 className="font-pp-display text-pp-headline-lg font-bold text-pp-on-surface">
              {locale === 'he' ? 'בחר חבילת מדדי צמיחה' : 'Choose your Growth Metric Pack'}
            </h2>
            <p className="text-pp-body-md text-pp-on-surface-variant mt-1">
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
                    'flex items-start justify-between gap-3 rounded-2xl p-4 cursor-pointer transition-all duration-150',
                    isSelected
                      ? 'bg-pp-primary-fixed/25 ring-2 ring-pp-primary shadow-pp-candy'
                      : 'bg-pp-surface-container-low hover:bg-pp-surface-container shadow-xs',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all',
                        isSelected ? 'bg-pp-primary text-pp-on-primary' : 'bg-pp-surface-container text-pp-outline',
                      )}
                    >
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">{pack.title}</h4>
                        <PpPill accent={pack.badgeAccent}>{pack.badge}</PpPill>
                      </div>
                      <p className="text-pp-body-sm text-pp-on-surface-variant mt-1">{pack.desc}</p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all mt-1',
                      isSelected ? 'border-pp-primary bg-pp-primary text-pp-on-primary' : 'border-pp-outline-variant',
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Data Sources Connector */}
      {currentStep === 3 && (
        <div data-testid="onboarding-step-3" className="space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pp-secondary-container text-pp-on-secondary-container text-pp-label-sm font-bold mb-3">
              <Globe className="h-3.5 w-3.5" />
              <span>{locale === 'he' ? 'זרימות נתונים חיות' : 'Real-time Ingestion'}</span>
            </div>
            <h2 className="font-pp-display text-pp-headline-lg font-bold text-pp-on-surface">
              {locale === 'he' ? 'חבר מקורות נתונים' : 'Connect Data Sources'}
            </h2>
            <p className="text-pp-body-md text-pp-on-surface-variant mt-1">
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
                    'flex items-center justify-between rounded-2xl p-4 cursor-pointer transition-all duration-150',
                    isConnected
                      ? 'bg-pp-secondary-container/20 ring-2 ring-pp-secondary shadow-pp-candy'
                      : 'bg-pp-surface-container-low hover:bg-pp-surface-container shadow-xs',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl',
                        isConnected
                          ? 'bg-pp-secondary-container text-pp-secondary'
                          : 'bg-pp-surface-container text-pp-outline',
                      )}
                    >
                      <Globe className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-pp-display text-pp-body-md font-bold text-pp-on-surface">{source.name}</h4>
                      <span className="text-pp-label-sm text-pp-outline">{source.tag}</span>
                    </div>
                  </div>

                  <PpPill accent={isConnected ? 'mint' : 'neutral'}>
                    {isConnected ? (locale === 'he' ? 'מחובר' : 'Connected') : (locale === 'he' ? 'לא פעיל' : 'Disabled')}
                  </PpPill>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 4: Celebration & Launch Step */}
      {currentStep === 4 && (
        <div data-testid="onboarding-step-4" className="space-y-6 text-center py-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-pp-secondary-container text-pp-secondary shadow-pp-candy">
              <PartyPopper className="h-8 w-8 animate-bounce" />
            </div>
          </div>

          <div>
            <h2 className="font-pp-display text-pp-headline-xl font-bold text-pp-on-surface">
              {locale === 'he' ? 'הכל מוכן לפעולה!' : "You're all set to scale!"}
            </h2>
            <p className="text-pp-body-md text-pp-on-surface-variant mt-1 max-w-md mx-auto">
              {locale === 'he'
                ? `סביבת העבודה ${projectName} הוגדרה בהצלחה. ה-AI Copilot מוכן לייעל קמפיינים ולזהות הזדמנויות צמיחה.`
                : `Workspace "${projectName}" is ready with ${connectedSources.length} connected channels. AI Copilot is primed for optimization.`}
            </p>
          </div>

          {/* Config Summary Card */}
          <div className="rounded-2xl bg-pp-surface-container-low p-4 text-start text-pp-body-md space-y-2.5">
            <div className="flex justify-between border-b border-pp-surface-container pb-2">
              <span className="text-pp-on-surface-variant">{locale === 'he' ? 'סביבת עבודה' : 'Workspace'}:</span>
              <span className="font-bold text-pp-on-surface">{projectName}</span>
            </div>
            <div className="flex justify-between border-b border-pp-surface-container pb-2">
              <span className="text-pp-on-surface-variant">{locale === 'he' ? 'ורטיקל' : 'Vertical'}:</span>
              <span className="font-semibold text-pp-on-surface">{vertical}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-pp-on-surface-variant">{locale === 'he' ? 'ערוצים מחוברים' : 'Active Channels'}:</span>
              <span className="font-bold text-pp-secondary">{connectedSources.length} sources</span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons Footer */}
      <div className="mt-8 flex items-center justify-between border-t border-pp-surface-container pt-6">
        {currentStep > 1 && currentStep < 4 ? (
          <PpButton
            type="button"
            variant="secondary"
            onClick={handlePrevStep}
            className="flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            <span>{locale === 'he' ? 'חזור' : 'Back'}</span>
          </PpButton>
        ) : (
          <div />
        )}

        {currentStep < 4 ? (
          <PpButton
            type="button"
            variant="primary"
            data-testid="onboarding-next-button"
            onClick={handleNextStep}
            className="flex items-center gap-1.5 shadow-pp-candy"
          >
            <span>{locale === 'he' ? 'המשך' : 'Continue'}</span>
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </PpButton>
        ) : (
          <PpButton
            type="button"
            variant="primary"
            data-testid="onboarding-finish-button"
            disabled={isSubmitting}
            onClick={handleFinish}
            className="w-full sm:w-auto flex items-center justify-center gap-2 h-12 px-8 font-pp-display text-pp-body-lg font-bold shadow-pp-candy active:scale-[0.98]"
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )}
            <span>{locale === 'he' ? 'כניסה ללוח הבקרה' : 'Launch Growth Cockpit'}</span>
          </PpButton>
        )}
      </div>
    </div>
  );
}
