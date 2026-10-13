import { Check, Lock } from 'lucide-react';
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
 * The Ad Studio's step bar: Brief -> Plan (confirm) -> Create -> Review and edit -> Publish. The
 * numbers are the real order of work; the step being viewed is highlighted, finished steps show a
 * check, and steps that need an earlier one (Create before the plan is confirmed) are locked.
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
  return (
    <nav
      aria-label={label}
      className="z-10 rounded-3xl border border-border/60 bg-card/95 px-2 py-4 shadow-soft backdrop-blur md:sticky md:top-2 sm:px-4"
      data-testid="ad-studio-stepper"
    >
      <ol className="grid grid-cols-5">
        {steps.map((step, index) => {
          const isActive = step.id === active;
          const next = steps[index + 1];
          const content = (
            <>
              <span
                className={cn(
                  'relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-glow ring-4 ring-primary/15'
                    : step.state === 'done'
                      ? 'bg-primary text-primary-foreground'
                      : step.state === 'locked'
                        ? 'bg-muted text-muted-foreground'
                        : 'border-2 border-primary/40 bg-card text-primary',
                )}
                aria-hidden="true"
              >
                {step.state === 'done' && !isActive ? (
                  <Check className="h-4 w-4" />
                ) : step.state === 'locked' ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  index + 1
                )}
              </span>
              <span className={cn('max-w-full text-center text-[11px] font-medium leading-tight sm:truncate sm:text-xs', isActive ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                <span className="hidden sm:inline">{index + 1}. </span>
                {step.label}
              </span>
              <span className="hidden max-w-full truncate text-center text-[11px] text-muted-foreground/80 lg:block">{step.hint}</span>
            </>
          );
          const className = cn(
            'relative flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
            step.state === 'locked' ? 'opacity-60' : !isActive && 'hover:bg-muted/60',
          );
          return (
            <li key={step.id} className="relative min-w-0" data-testid={`ad-studio-step-${step.id}`} data-state={step.state}>
              {/* The line to the next step: filled once this step is done. */}
              {next ? (
                <span
                  className={cn('absolute start-1/2 top-[1.375rem] h-0.5 w-full', step.state === 'done' ? 'bg-primary' : 'bg-border')}
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
