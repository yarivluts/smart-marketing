import type * as React from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** For a newcomer who would rather not set anything up: Growth Pilot reads their website and does the work. */
export function OnboardingPilotShortcut({ orgId, projectId }: { orgId: string; projectId: string }): React.ReactElement {
  const t = useTranslations('Onboarding');
  return (
    <aside className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="onboarding-pilot-shortcut">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{t('pilotShortcutTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('pilotShortcutBody')}</p>
        </div>
      </div>
      <Link href={`/orgs/${orgId}/projects/${projectId}/growth-pilot`} className={cn(buttonVariants({ variant: 'default' }), 'shrink-0')}>
        {t('pilotShortcutButton')}
      </Link>
    </aside>
  );
}
