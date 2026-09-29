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
export function AdStudioStepper({ steps, active, label }: { steps: AdStudioStepNav[]; active: AdStudioStepId; label: string }): React.ReactElement {
  return (
    <nav aria-label={label} className="sticky top-2 z-10 rounded-2xl border border-border bg-card/95 p-2 shadow-sm backdrop-blur" data-testid="ad-studio-stepper">
      <ol className="grid grid-cols-5 gap-1">
        {steps.map((step, index) => {
          const isActive = step.id === active;
          const content = (
            <>
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  step.state === 'done' ? 'bg-success text-white' : isActive ? 'bg-primary text-primary-foreground' : step.state === 'locked' ? 'bg-muted text-muted-foreground' : 'border border-primary/50 text-primary',
                )}
                aria-hidden="true"
              >
                {step.state === 'done' ? <Check className="h-3.5 w-3.5" /> : step.state === 'locked' ? <Lock className="h-3 w-3" /> : index + 1}
              </span>
              <span className="hidden min-w-0 flex-col sm:flex">
                <span className="truncate text-sm font-semibold">{step.label}</span>
                <span className="truncate text-[11px] text-muted-foreground">{step.hint}</span>
              </span>
            </>
          );
          const className = cn(
            'flex items-center justify-center gap-2 rounded-xl px-2 py-2 sm:justify-start',
            isActive ? 'bg-primary/10 ring-1 ring-primary/40' : step.state === 'locked' ? 'opacity-60' : 'hover:bg-muted',
          );
          return (
            <li key={step.id} data-testid={`ad-studio-step-${step.id}`} data-state={step.state}>
              {step.state === 'locked' ? (
                <span className={className} aria-disabled="true" title={step.hint}>
                  {content}
                  <span className="sr-only">{step.label}</span>
                </span>
              ) : (
                <Link href={step.href} className={className} aria-current={isActive ? 'step' : undefined} title={step.label}>
                  {content}
                  <span className="sr-only sm:hidden">{step.label}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
