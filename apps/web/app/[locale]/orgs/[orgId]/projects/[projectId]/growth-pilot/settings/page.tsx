import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { can } from '@growthos/shared';
import { getGrowthProjectThresholds } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { Link } from '@/i18n/navigation';
import { SuggestionThresholdsForm } from '@/components/growth-pilot/suggestion-thresholds-form';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'GrowthPilot.settings' });
  return { title: t('metaTitle') };
}

/**
 * The project's Growth Pilot suggestion thresholds - when the pilot says "nobody clicks", "the page
 * needs work" or "raise the budget" - for the project's admins (`project.manage`), over the platform
 * defaults GrowthOS operators set. Changes are audited.
 */
export default async function GrowthPilotSettingsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);
  const session = await getServerSession();
  const here = `/orgs/${orgId}/projects/${projectId}/growth-pilot/settings`;
  if (!session) redirect(`/${locale}/login?from=${encodeURIComponent(here)}`);
  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId, projectId })) notFound();
  await ensureFirestoreOrm();
  const settings = await getGrowthProjectThresholds(orgId, projectId);
  const t = await getTranslations('GrowthPilot.settings');
  return (
    <div className="container mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <Link href={`/orgs/${orgId}/projects/${projectId}/growth-pilot`} className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {t('back')}
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="font-pp-display text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
      </header>
      <SuggestionThresholdsForm
        endpoint={`/api/orgs/${orgId}/projects/${projectId}/growth-pilot/settings`}
        scope="project"
        initial={{ overrides: settings.overrides, defaults: settings.platform, lastChangedOn: settings.lastChangedOn }}
      />
    </div>
  );
}
