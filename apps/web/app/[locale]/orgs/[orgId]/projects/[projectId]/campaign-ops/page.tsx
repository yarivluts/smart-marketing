import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { CAMPAIGN_OPS_PACK_PLUGIN_ID, CAMPAIGN_SPEND_TRAILING_WINDOW_DAYS } from '@growthos/firebase-orm-models';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  builtinMetricPacks,
  getCampaignPaybackBreakdownForProject,
  getCampaignSpendBreakdownForProject,
  getPaybackOverviewForProject,
  getQualityCalibrationBreakdownForProject,
  listOrgProjects,
  listPluginInstallsForProject,
} from '@/lib/orgs/queries';
import { hasActiveInstall, toPluginInstallView } from '@/lib/orgs/plugin-view';
import { campaignSpendStatusLabelKey } from '@/lib/orgs/campaign-ops-view';
import { signupQualityScoreTierLabelKey } from '@/lib/orgs/quality-score-view';
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
 * overview, a per-campaign `collection_40d`/`roi_40d` breakdown (2026-08-25
 * follow-up — the AC's own "true per-campaign roi_nd/collection_nd" bullet,
 * `getCampaignPaybackBreakdownForProject`), a predicted-vs-actual quality
 * calibration table (`quality_calibration_*`, the Campaign Ops pack), and a
 * per-campaign spend budget table with inline-editable targets driving
 * red/green (`ad_spend`-by-`campaign_id`, no pack install required —
 * `ad_spend` is the SaaS pack's own metric). Spend targets are independent
 * of the other three: a project can have spend targets with the Campaign
 * Ops pack never installed, and vice versa; the payback overview, the
 * per-campaign breakdown, and calibration all share one pack-install gate
 * since every one of them reads a mart that pack registers. Gated on
 * `dashboards.write`, the same permission Goals/Segments use for a
 * project-scoped editable-target admin surface.
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

  const [paybackOutcome, campaignPaybackOutcome, spendOutcome, calibrationOutcome] = await Promise.all([
    paybackPackInstalled ? getPaybackOverviewForProject(orgId, projectId) : Promise.resolve(null),
    paybackPackInstalled ? getCampaignPaybackBreakdownForProject(orgId, projectId) : Promise.resolve(null),
    getCampaignSpendBreakdownForProject(orgId, projectId),
    paybackPackInstalled ? getQualityCalibrationBreakdownForProject(orgId, projectId) : Promise.resolve(null),
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

      {paybackPackInstalled && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t('campaignPaybackHeading')}</h2>
          <p className="text-xs text-muted-foreground">{t('campaignPaybackDescription')}</p>
          {!campaignPaybackOutcome || !campaignPaybackOutcome.ok ? (
            <p className="text-muted-foreground">{t('campaignPaybackUnavailable')}</p>
          ) : campaignPaybackOutcome.rows.length === 0 ? (
            <p className="text-muted-foreground">{t('campaignPaybackEmpty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-input text-left text-xs text-muted-foreground">
                  <th className="py-2 pe-3 font-medium">{t('columnCampaign')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnCollectedRevenue40d')}</th>
                  <th className="py-2 font-medium">{t('columnRoi40d')}</th>
                </tr>
              </thead>
              <tbody>
                {campaignPaybackOutcome.rows.map((row) => (
                  <tr key={row.campaignId} className="border-b border-input last:border-0">
                    <td className="py-2 pe-3 font-medium">{row.campaignId}</td>
                    <td className="py-2 pe-3 tabular-nums">{row.collectedRevenue40d.toLocaleString(locale)}</td>
                    <td className="py-2 tabular-nums">{row.roi40d === null ? t('campaignPaybackNoData') : row.roi40d.toLocaleString(locale, { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {paybackPackInstalled && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{t('calibrationHeading')}</h2>
          <p className="text-xs text-muted-foreground">{t('calibrationDescription')}</p>
          {!calibrationOutcome || !calibrationOutcome.ok ? (
            <p className="text-muted-foreground">{t('calibrationUnavailable')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-input text-left text-xs text-muted-foreground">
                  <th className="py-2 pe-3 font-medium">{t('columnQualityTier')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnSignups')}</th>
                  <th className="py-2 pe-3 font-medium">{t('columnPayingRate')}</th>
                  <th className="py-2 font-medium">{t('columnAvgRevenue40d')}</th>
                </tr>
              </thead>
              <tbody>
                {calibrationOutcome.tiers.map((tier) => (
                  <tr key={tier.qualityTier} className="border-b border-input last:border-0">
                    <td className="py-2 pe-3 font-medium">{t(signupQualityScoreTierLabelKey(tier.qualityTier))}</td>
                    <td className="py-2 pe-3 tabular-nums">{tier.signups.toLocaleString(locale)}</td>
                    <td className="py-2 pe-3 tabular-nums">{tier.payingRate === null ? t('calibrationNoData') : `${(tier.payingRate * 100).toFixed(1)}%`}</td>
                    <td className="py-2 tabular-nums">{tier.avgCollectedRevenue40d === null ? t('calibrationNoData') : tier.avgCollectedRevenue40d.toLocaleString(locale, { maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

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
