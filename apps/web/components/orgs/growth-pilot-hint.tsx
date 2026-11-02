import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

type GrowthPilotHintProps = Readonly<{ orgId: string; projectId: string }>;

/** Tells a newcomer on the data-setup page that Growth Pilot does the work for them. */
export function GrowthPilotHint({ orgId, projectId }: GrowthPilotHintProps): React.ReactElement {
  const t = useTranslations('Onboarding');
  return (
    <p className="text-sm text-muted-foreground">
      {t('globalPilotHint')}{' '}
      <Link href={`/orgs/${orgId}/projects/${projectId}/growth-pilot`} className="font-medium text-primary underline">
        {t('globalPilotLink')}
      </Link>
    </p>
  );
}
