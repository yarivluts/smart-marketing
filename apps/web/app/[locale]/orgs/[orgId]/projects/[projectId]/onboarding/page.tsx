import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
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

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Onboarding' });
  return { title: t('metaTitle') };
}

/**
 * The onboarding wizard (KAN-68, plan `10 §2.6`/`13 §E13.1`): org/project already exist by the time
 * this page is reached (created via the org page's own "new project" flow, which now redirects
 * straight here) — pick a vertical/metric pack, connect a first source (or push-your-own), confirm an
 * AI-proposed funnel mapping, then land on the starter board with links to invite the team / set a
 * goal / turn on the war room. Every step's actual work happens through its own existing surface
 * (plugin install, key mint, board seeding, invites, goals, TV pairing) — this page only sequences
 * them and tracks progress. Gated on `project.manage`, the same permission every constituent action is
 * already reachable through for a `project_admin`.
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
    notFound();
  }

  const t = await getTranslations('Onboarding');
  const state = await getOnboardingState(orgId, projectId);

  if (!state) {
    return (
      <main className="container mx-auto flex max-w-2xl flex-col gap-8 py-16">
        <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>
        <StartOnboardingButton orgId={orgId} projectId={projectId} />
      </main>
    );
  }

  const view = toOnboardingStateView(state);

  return (
    <main className="container mx-auto flex max-w-2xl flex-col gap-8 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{t('title', { projectName: project.name })}</h1>

      {view.step === 'pack' ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('packStepHeading')}</h2>
          <OnboardingPackStep orgId={orgId} projectId={projectId} packs={onboardingMetricPacks()} />
        </section>
      ) : null}

      {view.step === 'sources' ? <SourcesStep orgId={orgId} projectId={projectId} /> : null}

      {view.step === 'funnel' ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('funnelStepHeading')}</h2>
          <OnboardingFunnelStep orgId={orgId} projectId={projectId} proposal={await proposeOnboardingFunnelSteps(orgId, projectId)} />
        </section>
      ) : null}

      {view.step === 'board' || view.step === 'done' ? <FinalStep orgId={orgId} projectId={projectId} done={view.step === 'done'} /> : null}
    </main>
  );
}

/** The "connect a first source" step's own sub-tree (KAN-68 AC, plan `10 §2.6` step 2) — kept in its own async component so the page body above stays a flat step switch. */
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
    <section className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">{t('sourceStepHeading')}</h2>
      <p className="text-muted-foreground">{t('sourceStepIntro')}</p>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">{t('sourceStepPluginHeading')}</h3>
        {connectedSourceInstall ? (
          <p className="text-sm text-muted-foreground">{t('sourceStepPluginConnected', { pluginId: connectedSourceInstall.pluginId })}</p>
        ) : installableSourceManifests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('sourceStepNoManifests')}{' '}
            <Link className="underline" href={`/orgs/${orgId}/plugins`}>
              {t('sourceStepNoManifestsLink')}
            </Link>
          </p>
        ) : (
          <InstallPluginForm orgId={orgId} projectId={projectId} manifests={installableSourceManifests} />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">{t('sourceStepPushYourOwnHeading')}</h3>
        {environmentOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('sourceStepNoEnvironments')}</p>
        ) : (
          <CreateApiKeyForm orgId={orgId} projectId={projectId} environments={environmentOptions} ingestBaseUrl={ingestApiUrl()} />
        )}
      </div>

      {connectedSourceInstall ? (
        <OnboardingSourceContinueButton orgId={orgId} projectId={projectId} method="plugin" pluginId={connectedSourceInstall.pluginId} />
      ) : hasIngestKey ? (
        <OnboardingSourceContinueButton orgId={orgId} projectId={projectId} method="push_your_own" />
      ) : (
        <p className="text-sm text-muted-foreground">{t('sourceStepContinueHint')}</p>
      )}
    </section>
  );
}

/** The wizard's final screen (KAN-68 AC: "starter board" + plan `10 §2.6` step 5's invite/goal/war-room CTAs, folded together — see `OnboardingStateModel.step`'s own doc comment for why `board` carries both). */
async function FinalStep({ orgId, projectId, done }: { orgId: string; projectId: string; done: boolean }): Promise<React.ReactElement> {
  const t = await getTranslations('Onboarding');
  const boards = await listBoardsForProject(orgId, projectId);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t('boardStepHeading')}</h2>
      {boards.length === 0 ? (
        <p className="text-muted-foreground">{t('boardStepEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {boards.map((board) => (
            <li key={board.id}>
              <Link className="underline" href={`/orgs/${orgId}/projects/${projectId}/boards/${board.id}`}>
                {board.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-4">
        <Link className="text-sm underline" href={`/orgs/${orgId}`}>
          {t('inviteTeamLink')}
        </Link>
        <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${projectId}/goals`}>
          {t('setGoalLink')}
        </Link>
        <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${projectId}/tv`}>
          {t('warRoomLink')}
        </Link>
      </div>

      {done ? <p className="font-medium">{t('doneMessage')}</p> : <CompleteOnboardingButton orgId={orgId} projectId={projectId} />}
    </section>
  );
}
