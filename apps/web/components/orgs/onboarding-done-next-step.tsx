import type * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Finished onboarding: say so, and (when allowed) point the newcomer at the one next thing - Growth Pilot - instead of a dead end. */
export function OnboardingDoneNextStep({ orgId, projectId, canUsePilot }: { orgId: string; projectId: string; canUsePilot: boolean }): React.ReactElement {
  const t = useTranslations('Onboarding');
  return (
    <div className="flex flex-col gap-3" data-testid="onboarding-done">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
        {t('doneMessage')}
      </p>
      {canUsePilot ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t('doneNextStepBody')}</p>
          <Link href={`/orgs/${orgId}/projects/${projectId}/growth-pilot`} className={cn(buttonVariants({ variant: 'default' }), 'self-start')}>
            {t('doneNextStepButton')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
