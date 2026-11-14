'use client';

import { Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

export type AdStudioStepId = 'brief' | 'plan' | 'create' | 'review' | 'publish';
export type AdStudioStepState = 'done' | 'current' | 'next' | 'locked';

export interface AdStudioStepNav {
  id: AdStudioStepId;
  label: string;
  hint: string;
  state: AdStudioStepState;
  href: string;
}

/**
 * Pastel Pulse 5-step stepper: a thumb-friendly horizontal pill bar on phones with a clear
 * "Step X of 5" summary header, expanding into a clean 5-column progress track on desktop.
 */
export function AdStudioStepper({
  steps,
  active,
  label,
}: {
  steps: AdStudioStepNav[];
  active: AdStudioStepId;
  label: string;
}): React.ReactElement {
  const tWorkspace = useTranslations('AdStudio.stepWorkspace');
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === active));
  const activeStep = steps[activeIndex];

  return (
    <nav
      aria-label={label}
      className="z-10 rounded-3xl border border-pp-outline-variant/40 bg-card/95 px-3 py-3 shadow-pp-candy backdrop-blur md:sticky md:top-2 md:px-4 md:py-3.5"
      data-testid="ad-studio-stepper"
    >
      {activeStep ? (
        <div className="mb-2.5 flex items-center justify-between gap-2 px-1 md:hidden">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full bg-pp-primary" aria-hidden="true" />
            <span className="truncate font-pp-display text-xs font-bold text-foreground">
              {tWorkspace('stepCounter', { current: activeIndex + 1, total: steps.length })} · {activeStep.label}
            </span>
          </div>
          <span className="max-w-[48%] truncate text-[11px] text-muted-foreground">
            {activeStep.hint}
          </span>
        </div>
      ) : null}

      <ol className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-5 md:gap-0 md:overflow-visible md:pb-0">
        {steps.map((step, index) => {
          const isActive = step.id === active;
          const next = steps[index + 1];
          const content = (
            <>
              <span
                className={cn(
                  'relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition md:h-9 md:w-9 md:text-sm',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground md:bg-primary md:text-primary-foreground md:shadow-glow md:ring-4 md:ring-primary/15'
                    : step.state === 'done'
                      ? 'bg-emerald-500/15 text-emerald-700 md:bg-primary md:text-primary-foreground'
                      : step.state === 'locked'
                        ? 'bg-muted text-muted-foreground'
                        : 'border border-pp-primary/40 bg-card text-pp-primary md:border-2',
                )}
                aria-hidden="true"
              >
                {step.state === 'done' && !isActive ? (
                  <Check className="h-3.5 w-3.5 md:h-4 md:w-4" />
                ) : step.state === 'locked' ? (
                  <Lock className="h-3 w-3 md:h-3.5 md:w-3.5" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  'whitespace-nowrap text-xs font-semibold leading-tight md:max-w-full md:truncate md:text-center',
                  isActive
                    ? 'text-primary-foreground md:text-pp-primary'
                    : 'text-foreground/85 md:text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </>
          );

          const className = cn(
            'relative flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary md:min-w-0 md:flex-col md:gap-1.5 md:rounded-2xl md:border-0 md:bg-transparent md:px-1 md:py-1',
            isActive
              ? 'border-primary bg-primary shadow-sm md:shadow-none'
              : step.state === 'locked'
                ? 'border-border/50 bg-muted/50 opacity-60 md:bg-transparent'
                : 'border-pp-outline-variant/40 bg-pp-surface-container-low hover:bg-pp-primary-fixed md:hover:bg-muted/50',
          );

          return (
            <li key={step.id} className="relative shrink-0 md:min-w-0" data-testid={`ad-studio-step-${step.id}`} data-state={step.state}>
              {next ? (
                <span
                  className={cn(
                    'absolute start-1/2 top-[1.375rem] hidden h-0.5 w-full md:block',
                    step.state === 'done' ? 'bg-primary' : 'bg-border',
                  )}
                  aria-hidden="true"
                />
              ) : null}
              {step.state === 'locked' ? (
                <span className={className} aria-disabled="true" title={step.hint}>
                  {content}
                </span>
              ) : (
                <Link
                  href={step.href}
                  className={className}
                  aria-current={isActive ? 'step' : undefined}
                  title={step.hint}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
