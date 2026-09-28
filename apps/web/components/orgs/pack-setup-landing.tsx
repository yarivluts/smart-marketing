import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { PackageOpen } from 'lucide-react';
import { ChartCard, PageHero } from '@/components/viz';
import { InstallBuiltinPackSection, type InstallBuiltinPackOption } from '@/components/orgs/install-builtin-pack-section';

export interface PackSetupFeature {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface PackSetupLandingProps {
  orgId: string;
  projectId: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  /** Why the page is empty and what installing the pack does. */
  intro: string;
  /** What the page shows once the pack is installed - described in words, never with sample numbers. */
  features: readonly PackSetupFeature[];
  featuresTitle: string;
  installTitle: string;
  packs: readonly InstallBuiltinPackOption[];
}

/**
 * The page a pack-backed analytics view shows before its pack is installed: the same hero the
 * installed page opens with, a short tour of what each section will chart once data lands, and the
 * one-click install card. The tour is words and icons only - no illustrative numbers, because a
 * preview chart filled with made-up values reads as this project's data (Jira B15).
 */
export function PackSetupLanding({ orgId, projectId, icon, eyebrow, title, intro, features, featuresTitle, installTitle, packs }: PackSetupLandingProps): React.ReactElement {
  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      <PageHero icon={icon} eyebrow={eyebrow} title={title} description={intro} />

      <section aria-label={featuresTitle} className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{featuresTitle}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ key, icon: FeatureIcon, title: featureTitle, description }) => (
            <li key={key} className="flex gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm" data-testid="pack-setup-feature">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FeatureIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0 text-start">
                <p className="text-sm font-semibold text-foreground">{featureTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <ChartCard title={installTitle} icon={PackageOpen}>
        <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={packs} />
      </ChartCard>
    </div>
  );
}
