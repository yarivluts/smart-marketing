import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listGrowthPilotIndex, OrganizationModel } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { isPlatformOperator } from '@/lib/auth/platform-operator';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { ensureFirestoreOrm } from '@/lib/firebase/firestore';
import { OperatorPilots, type OperatorPilotRow } from '@/components/growth-pilot/operator-pilots';

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

/**
 * Every Growth Pilot on the platform, for GrowthOS operators: each customer's site, where its pilot
 * stands, when the scheduler last ran it and how that went, and a pause for any of them. Anyone who
 * is not a platform operator gets a 404.
 */
export default async function OperatorGrowthPilotsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getServerSession();
  if (!session) redirect(`/${locale}/login?from=%2Foperator%2Fgrowth-pilots`);
  const { user } = await resolveOrgSessionContext(session);
  if (!isPlatformOperator(user.email)) notFound();
  await ensureFirestoreOrm();
  const t = await getTranslations('GrowthPilot.operator');
  const index = (await listGrowthPilotIndex()).filter((row) => row.status !== 'archived');
  const names = new Map<string, string>();
  for (const organizationId of new Set(index.map((row) => row.organization_id))) {
    const organization = await OrganizationModel.init(organizationId);
    names.set(organizationId, organization?.name ?? organizationId);
  }
  const rows: OperatorPilotRow[] = index
    .sort((a, b) => b.updated_on.localeCompare(a.updated_on))
    .map((row) => ({
      organizationId: row.organization_id,
      organizationName: names.get(row.organization_id) ?? row.organization_id,
      projectId: row.project_id,
      siteUrl: row.site_url,
      status: row.status,
      lastRunOn: row.last_run_on ?? null,
      lastRunOutcome: row.last_run_outcome ?? null,
    }));
  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-pp-display text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>
      <OperatorPilots rows={rows} />
    </div>
  );
}
