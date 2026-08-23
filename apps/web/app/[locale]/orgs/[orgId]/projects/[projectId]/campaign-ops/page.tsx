import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { CAMPAIGN_OPS_PACK_PLUGIN_ID, CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import { builtinMetricPacks, getCampaignSpendBreakdownForProject, getPaybackOverviewForProject, listOrgProjects, listPluginInstallsForProject } from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { campaignSpendStatusLabelKey } from '@/lib/orgs/campaign-ops-view';
import { InstallBuiltinPackSection } from '@/components/orgs/install-builtin-pack-section';
import { CampaignTargetInput } from '@/components/orgs/campaign-target-input';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'CampaignOps' });
  return { title: t('metaTitle') };
}

/**
 * Campaign ops (KAN-86, E18.x, plan `14 §Gap 12`): a fixed-window payback
 * overview (`collection_Nd`, the Campaign Ops pack) and a per-campaign spend
 * budget table with inline-editable targets driving red/green
 * (`ad_spend`-by-`campaign_id`, no pack install required — `ad_spend` is the
 * SaaS pack's own metric). The two sections are independent: a project can
 * have spend targets with the Campaign Ops pack never installed, and vice
 * versa. Gated on `dashboards.write`, the same permission Goals/Segments use
 * for a project-scoped editable-target admin surface.
 */
export default async function CampaignOpsPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fcampaign-ops`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'dashboards.write', { orgId })) {
    notFound();
  }

  const [projects, installs] = await Promise.all([listOrgProjects(orgId), listPluginInstallsForProject(orgId, projectId)]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    notFound();
  }

  const installViews = installs.map(toPluginInstallView);
  const paybackPackInstalled = hasActiveInstall(installViews, CAMPAIGN_OPS_PACK_PLUGIN_ID);

  const [paybackOutcome, spendOutcome] = await Promise.all([
    paybackPackInstalled ? getPaybackOverviewForProject(orgId, projectId) : Promise.resolve(null),
    getCampaignSpendBreakdownForProject(orgId, projectId),
  ]);

  const t = await getTranslations('CampaignOps');

  return (
    <main className="container mx-auto flex max-w-3xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('paybackHeading')}</h2>
        {!paybackPackInstalled ? (
          <InstallBuiltinPackSection orgId={orgId} projectId={projectId} packs={builtinMetricPacks().filter((pack) => pack.pluginId === CAMPAIGN_OPS_PACK_PLUGIN_ID)} />
        ) : !paybackOutcome || !paybackOutcome.ok ? (
          <p className="text-muted-foreground">{t('paybackUnavailable')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {paybackOutcome.windows.map((window) => (
              <li key={window.windowDays} className="flex flex-col gap-1 rounded-md border border-input px-3 py-2">
                <span className="text-xs text-muted-foreground">{t('paybackWindowLabel', { days: window.windowDays })}</span>
                <span className="text-lg font-semibold tabular-nums">{window.collectedRevenue.toLocaleString(locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t('spendTargetsHeading')}</h2>
        <p className="text-xs text-muted-foreground">{t('spendTargetsDescription', { days: CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS })}</p>
        {!spendOutcome.ok ? (
          <p className="text-muted-foreground">{t('spendTargetsUnavailable')}</p>
        ) : spendOutcome.rows.length === 0 ? (
          <p className="text-muted-foreground">{t('spendTargetsEmpty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-input text-left text-xs text-muted-foreground">
                <th className="py-2 pe-3 font-medium">{t('columnCampaign')}</th>
                <th className="py-2 pe-3 font-medium">{t('columnActualSpend')}</th>
                <th className="py-2 pe-3 font-medium">{t('columnTarget')}</th>
                <th className="py-2 font-medium">{t('columnStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {spendOutcome.rows.map((row) => (
                <tr key={row.campaignId} className="border-b border-input last:border-0">
                  <td className="py-2 pe-3 font-medium">{row.campaignId}</td>
                  <td className="py-2 pe-3 tabular-nums">{row.actualSpend.toLocaleString(locale)}</td>
                  <td className="py-2 pe-3">
                    <CampaignTargetInput orgId={orgId} projectId={projectId} campaignId={row.campaignId} monthlyBudget={row.monthlyBudget} />
                  </td>
                  <td className="py-2">
                    <span
                      className={
                        row.status === 'over_target'
                          ? 'text-destructive'
                          : row.status === 'on_target'
                            ? 'text-green-600 dark:text-green-500'
                            : 'text-muted-foreground'
                      }
                    >
                      {t(campaignSpendStatusLabelKey(row.status))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
