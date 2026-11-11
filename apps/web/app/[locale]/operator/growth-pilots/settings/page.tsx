import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { getGrowthPlatformThresholds } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { isPlatformOperator } from '@/lib/auth/platform-operator';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { Link } from '@/i18n/navigation';
import { SuggestionThresholdsForm } from '@/components/growth-pilot/suggestion-thresholds-form';
import { ThresholdsHistory } from '@/components/growth-pilot/thresholds-history';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

/**
 * The Growth Pilot suggestion thresholds every project starts from, for GrowthOS operators, with the
 * recent changes and who made them. Anyone who is not a platform operator gets a 404.
 */
export default async function OperatorGrowthPilotSettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getServerSession();
  if (!session) redirect(`/${locale}/login?from=%2Foperator%2Fgrowth-pilots%2Fsettings`);
  const { user } = await resolveOrgSessionContext(session);
  if (!isPlatformOperator(user.email)) notFound();
  await ensureFirestoreOrm();
  const settings = await getGrowthPlatformThresholds();
  const t = await getTranslations('GrowthPilot.settings');
  return (
    <div className="container mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <Link href="/operator/growth-pilots" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {t('operatorBack')}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="font-pp-display text-2xl font-bold">{t('operatorTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('operatorIntro')}</p>
      </header>
      <SuggestionThresholdsForm endpoint="/api/operator/growth-pilots/settings" scope="platform" initial={{ overrides: settings.overrides, defaults: settings.builtIn, lastChangedOn: settings.lastChangedOn }} />
      <ThresholdsHistory history={settings.history.slice().reverse()} />
    </div>
  );
}
