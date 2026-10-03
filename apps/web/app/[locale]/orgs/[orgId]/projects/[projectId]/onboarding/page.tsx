import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import { Sparkles, Layers, ArrowRight, ShieldCheck, CheckCircle2, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { findActiveMembership } from '@/lib/orgs/access';
import {
  getOnboardingState,
  listApiKeysForProject,
  listBoardsForProject,
  listEnvironmentsForProject,
  listOrgProjects,
  listPluginInstallsForProject,
  listPluginManifestsForOrg,
  onboardingMetricPacks,
  proposeOnboardingFunnelSteps,
} from '@/lib/orgs/queries';
import { ingestApiUrl } from '@/lib/orgs/ingest-api-url';
import { hasActiveInstall, pluginTypeForInstall, toPluginInstallView, toPluginManifestView } from '@/lib/orgs/plugin-view';
import { toOnboardingStateView } from '@/lib/orgs/onboarding-view';
import { StartOnboardingButton } from '@/components/orgs/start-onboarding-button';
import { OnboardingPackStep } from '@/components/orgs/onboarding-pack-step';
import { OnboardingSourceContinueButton } from '@/components/orgs/onboarding-source-continue-button';
import { OnboardingFunnelStep } from '@/components/orgs/onboarding-funnel-step';
import { CompleteOnboardingButton } from '@/components/orgs/complete-onboarding-button';
import { InstallPluginForm } from '@/components/orgs/install-plugin-form';
import { CreateApiKeyForm } from '@/components/orgs/create-api-key-form';
import { SdkDeploymentWizard } from '@/components/onboarding/sdk-deployment-wizard';
import {
  PpPage,
  PpPageHeader,
  PpCard,
  PpButton,
  PpPill,
  PpInsetRow,
} from '@/components/pastel/primitives';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Onboarding' });
  return { title: t('metaTitle') };
}

/**
 * The project onboarding wizard (KAN-68, plan `10 §2.6`/`13 §E13.1`): renders inside NavShell.
 * Stitch design: desktop a96c47fc / 986fc1ad, mobile b959e096 / 22675f2c.
 */
export default async function OnboardingPage({ params }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fonboarding`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId })) {
    notFound();
  }

  const projects = await listOrgProjects(orgId);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    if (projects.length > 0) {
      redirect(`/${locale}/orgs/${orgId}/projects/${projects[0].id}/onboarding`);
    }
    redirect(`/${locale}/orgs/${orgId}`);
  }

  const t = await getTranslations('Onboarding');
  const state = await getOnboardingState(orgId, projectId);

  if (!state) {
    return (
      <PpPage>
        <PpPageHeader
          eyebrow="Setup Journey & Readiness"
          title={t('title', { projectName: project.name })}
          description="Complete initialization to activate autonomous attribution, real-time event streaming, and executive dashboard metrics."
        />
        <PpCard className="max-w-2xl mx-auto p-8 text-center space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pp-primary text-pp-on-primary shadow-pp-candy">
            <Sparkles className="h-7 w-7" />
          </div>
          <div>
            <h2 className="font-pp-display text-pp-headline-lg font-bold text-pp-on-surface">
              {t('title', { projectName: project.name })}
            </h2>
            <p className="text-pp-body-md text-pp-on-surface-variant mt-2 max-w-md mx-auto">
              Configure your growth metric pack, data sources, and conversion funnel milestones.
            </p>
          </div>
          <div className="pt-2 flex justify-center">
            <StartOnboardingButton orgId={orgId} projectId={projectId} />
          </div>
        </PpCard>
      </PpPage>
    );
  }

  const view = toOnboardingStateView(state);

  return (
    <PpPage className="space-y-8">
      <PpPageHeader
        eyebrow="Setup Journey & Readiness"
        title={t('title', { projectName: project.name })}
        description="Configure data streams, metric pack, and conversion funnel for high-velocity telemetry."
        actions={
          <div className="flex items-center gap-2">
            <PpPill accent="mint">
              <CheckCircle2 className="h-3 w-3" />
              <span>Pod Provisioned</span>
            </PpPill>
          </div>
        }
      />

      {/* Stitch Onboarding & SDK Deployment Wizard */}
      <SdkDeploymentWizard orgId={orgId} projectId={projectId} isDataConnected={true} />

      {/* Interactive Step Card */}
      <PpCard className="max-w-3xl mx-auto space-y-8">
        {view.step === 'pack' ? (
          <section className="space-y-4">
            <div>
              <PpPill accent="primary" className="mb-2">Step 1 of 4</PpPill>
              <h2 className="font-pp-display text-pp-headline-lg font-bold text-pp-on-surface">
                {t('packStepHeading')}
              </h2>
            </div>
            <OnboardingPackStep orgId={orgId} projectId={projectId} packs={onboardingMetricPacks()} />
          </section>
        ) : null}

        {view.step === 'sources' ? (
          <SourcesStep orgId={orgId} projectId={projectId} />
        ) : null}

        {view.step === 'funnel' ? (
          <section className="space-y-4">
            <div>
              <PpPill accent="primary" className="mb-2">Step 3 of 4</PpPill>
              <h2 className="font-pp-display text-pp-headline-lg font-bold text-pp-on-surface">
                {t('funnelStepHeading')}
              </h2>
            </div>
            <OnboardingFunnelStep orgId={orgId} projectId={projectId} proposal={await proposeOnboardingFunnelSteps(orgId, projectId)} />
          </section>
        ) : null}

        {view.step === 'board' || view.step === 'done' ? (
          <FinalStep orgId={orgId} projectId={projectId} done={view.step === 'done'} />
        ) : null}
      </PpCard>
    </PpPage>
  );
}

/**
 * The "connect a first source" step's own sub-tree.
 */
async function SourcesStep({ orgId, projectId }: { orgId: string; projectId: string }): Promise<React.ReactElement> {
  const t = await getTranslations('Onboarding');

  const [manifests, installs, environments, apiKeys] = await Promise.all([
    listPluginManifestsForOrg(orgId),
    listPluginInstallsForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
    listApiKeysForProject(orgId, projectId),
  ]);
  const manifestViews = manifests.map(toPluginManifestView);
  const installViews = installs.map(toPluginInstallView);
  const sourceManifests = manifestViews.filter((manifest) => manifest.type === 'source');
  const installableSourceManifests = sourceManifests.filter((manifest) => !hasActiveInstall(installViews, manifest.pluginId));
  const connectedSourceInstall = installViews.find(
    (install) => install.status === 'installed' && pluginTypeForInstall(install, manifestViews) === 'source',
  );
  const hasIngestKey = apiKeys.some((apiKey) => !apiKey.revokedAt && apiKey.scopes.includes('ingest.write'));
  const environmentOptions = environments.map((environment) => ({ id: environment.id, name: environment.name }));

  return (
    <section className="space-y-6">
      <div>
        <PpPill accent="primary" className="mb-2">Step 2 of 4</PpPill>
        <h2 className="font-pp-display text-pp-headline-lg font-bold text-pp-on-surface">
          {t('sourceStepHeading')}
        </h2>
        <p className="text-pp-body-md text-pp-on-surface-variant mt-1">{t('sourceStepIntro')}</p>
      </div>

      <div className="space-y-3">
        <h3 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">{t('sourceStepPluginHeading')}</h3>
        {connectedSourceInstall ? (
          <PpInsetRow>
            <span className="text-pp-body-md text-pp-secondary font-semibold">
              {t('sourceStepPluginConnected', { pluginId: connectedSourceInstall.pluginId })}
            </span>
          </PpInsetRow>
        ) : installableSourceManifests.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-2xl bg-pp-surface-container-low p-4">
            <p className="text-pp-body-md text-pp-on-surface-variant">{t('sourceStepNoManifests')}</p>
            <PpButton asChild size="sm" variant="secondary">
              <Link href={`/orgs/${orgId}/plugins`}>{t('sourceStepNoManifestsLink')}</Link>
            </PpButton>
          </div>
        ) : (
          <InstallPluginForm orgId={orgId} projectId={projectId} manifests={installableSourceManifests} />
        )}
      </div>

      <div className="space-y-3 pt-2">
        <h3 className="font-pp-display text-pp-headline-md font-bold text-pp-on-surface">{t('sourceStepPushYourOwnHeading')}</h3>
        <p className="text-pp-body-sm text-pp-on-surface-variant">{t('sourceStepPushYourOwnIntro')}</p>
        {environmentOptions.length === 0 ? (
          <p className="text-pp-body-sm text-pp-outline">{t('sourceStepNoEnvironments')}</p>
        ) : (
          <CreateApiKeyForm orgId={orgId} projectId={projectId} environments={environmentOptions} ingestBaseUrl={ingestApiUrl()} />
        )}
      </div>

      <div className="pt-2">
        {connectedSourceInstall ? (
          <OnboardingSourceContinueButton orgId={orgId} projectId={projectId} method="plugin" pluginId={connectedSourceInstall.pluginId} />
        ) : hasIngestKey ? (
          <OnboardingSourceContinueButton orgId={orgId} projectId={projectId} method="push_your_own" />
        ) : (
          <p className="text-pp-body-sm text-pp-outline">{t('sourceStepContinueHint')}</p>
        )}
      </div>
    </section>
  );
}

/** The wizard's final screen. */
async function FinalStep({ orgId, projectId, done }: { orgId: string; projectId: string; done: boolean }): Promise<React.ReactElement> {
  const t = await getTranslations('Onboarding');
  const boards = await listBoardsForProject(orgId, projectId);

  return (
    <section className="space-y-6">
      <div>
        <PpPill accent="mint" className="mb-2">Step 4 of 4</PpPill>
        <h2 className="font-pp-display text-pp-headline-lg font-bold text-pp-on-surface">
          {t('boardStepHeading')}
        </h2>
      </div>

      {boards.length === 0 ? (
        <p className="text-pp-body-md text-pp-on-surface-variant">{t('boardStepEmpty')}</p>
      ) : (
        <div className="space-y-2">
          {boards.map((board) => (
            <PpInsetRow key={board.id}>
              <Link
                className="font-medium text-pp-primary hover:underline flex items-center justify-between w-full"
                href={`/orgs/${orgId}/projects/${projectId}/boards/${board.id}`}
              >
                <span>{board.name}</span>
                <ChevronRight className="h-4 w-4 text-pp-outline rtl:rotate-180" />
              </Link>
            </PpInsetRow>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-4 pt-2">
        <Link className="text-pp-body-sm font-medium text-pp-primary hover:underline" href={`/orgs/${orgId}`}>
          {t('inviteTeamLink')}
        </Link>
        <Link className="text-pp-body-sm font-medium text-pp-primary hover:underline" href={`/orgs/${orgId}/projects/${projectId}/goals`}>
          {t('setGoalLink')}
        </Link>
        <Link className="text-pp-body-sm font-medium text-pp-primary hover:underline" href={`/orgs/${orgId}/projects/${projectId}/tv`}>
          {t('warRoomLink')}
        </Link>
      </div>

      <div className="pt-2">
        {done ? (
          <p className="font-bold text-pp-secondary text-pp-body-lg">{t('doneMessage')}</p>
        ) : (
          <CompleteOnboardingButton orgId={orgId} projectId={projectId} />
        )}
      </div>
    </section>
  );
}
