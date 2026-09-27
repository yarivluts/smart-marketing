import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChartCard } from '@/components/viz/chart-card';

export interface NextStep {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * A numbered "what happens after this form" rail for the create-org / create-project pages, so a
 * first-time user sees the journey they are starting instead of a lone input.
 */
export function NextStepsCard({ title, description, steps, icon }: { title: string; description?: string; steps: readonly NextStep[]; icon?: LucideIcon }): React.ReactElement {
  return (
    <ChartCard title={title} description={description} icon={icon}>
      <ol className="relative flex flex-col gap-5 border-s-2 border-dashed border-border ms-4">
        {steps.map((step, index) => (
          <li key={step.key} className="relative ps-8">
            <span className="absolute -start-[17px] top-0 flex h-8 w-8 items-center justify-center rounded-full bg-card text-primary ring-2 ring-primary/30" aria-hidden="true">
              <step.icon className="h-4 w-4" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              <span className="me-1 tabular-nums text-muted-foreground">{index + 1}.</span>
              {step.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </ChartCard>
  );
}
