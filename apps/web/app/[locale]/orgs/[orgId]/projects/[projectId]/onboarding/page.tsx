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
  listRecentIngestBatchesForProject,
  onboardingMetricPacks,
  proposeOnboardingFunnelSteps,
} from '@/lib/orgs/queries';
import { ingestApiUrl } from '@/lib/orgs/ingest-api-url';
import { hasActiveInstall, pluginTypeForInstall, toPluginInstallView, toPluginManifestView } from '@/lib/orgs/plugin-view';
import { buildFunnelEditorRows, toOnboardingStateView, type OnboardingStateView } from '@/lib/orgs/onboarding-view';
import { StartOnboardingButton } from '@/components/orgs/start-onboarding-button';
import { OnboardingPackStep } from '@/components/orgs/onboarding-pack-step';
import { OnboardingSourceContinueButton } from '@/components/orgs/onboarding-source-continue-button';
import { OnboardingFunnelStep } from '@/components/orgs/onboarding-funnel-step';
import { CompleteOnboardingButton } from '@/components/orgs/complete-onboarding-button';
import { InstallPluginForm } from '@/components/orgs/install-plugin-form';
import { CreateApiKeyForm } from '@/components/orgs/create-api-key-form';
import { Button } from '@/components/ui/button';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams?: Promise<{ editFunnel?: string }>;
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
export default async function OnboardingPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { editFunnel } = (await searchParams) ?? {};
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fonboarding`);
  }

  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, { type: 'user', id: user.id }, 'project.manage', { orgId, projectId })) {
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
  // The funnel editor is the wizard's own step, but a confirmed funnel stays editable from any later
  // step too (KAN-199): it can be set over MCP `set_funnel` at any time, so a human must be able to
  // review and change it here without restarting the wizard.
  const showFunnelEditor = view.step === 'funnel' || editFunnel === '1';
  const onboardingHref = `/orgs/${orgId}/projects/${projectId}/onboarding`;

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

      {showFunnelEditor ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('funnelStepHeading')}</h2>
          <OnboardingFunnelStep
            orgId={orgId}
            projectId={projectId}
            proposal={buildFunnelEditorRows(view.funnelSteps, await proposeOnboardingFunnelSteps(orgId, projectId))}
            {...(view.step === 'funnel' ? {} : { confirmedHref: onboardingHref })}
          />
        </section>
      ) : view.funnelSteps.length > 0 ? (
        <ConfirmedFunnelSummary orgId={orgId} projectId={projectId} funnelSteps={view.funnelSteps} editHref={`${onboardingHref}?editFunnel=1`} />
      ) : null}

      {view.step === 'board' || view.step === 'done' ? <FinalStep orgId={orgId} projectId={projectId} done={view.step === 'done'} /> : null}
    </main>
  );
}

/**
 * The "connect a first source" step's own sub-tree (KAN-68 AC, plan `10 §2.6`
 * step 2) — kept in its own async component so the page body above stays a
 * flat step switch.
 *
 * A brand-new org has zero registered source manifests, so every first-run
 * visitor hits the `installableSourceManifests.length === 0` branch. That
 * empty state's link to the org plugin registry was previously plain inline
 * text easy to read past as a caveat rather than a next step (found via
 * dogfooding QA); it's a real `Button` now. The "push your own data" path
 * below it — equally valid, and the one that actually works with zero setup
 * — gets its own one-line callout for the same reason: without it, a
 * first-time user reads the plugin dead end as *the* path and the API-key
 * form as an unlabeled afterthought, when it's the faster of the two.
 */
async function SourcesStep({ orgId, projectId }: { orgId: string; projectId: string }): Promise<React.ReactElement> {
  const t = await getTranslations('Onboarding');

  const [manifests, installs, environments, apiKeys, batches] = await Promise.all([
    listPluginManifestsForOrg(orgId),
    listPluginInstallsForProject(orgId, projectId),
    listEnvironmentsForProject(orgId, projectId),
    listApiKeysForProject(orgId, projectId),
    listRecentIngestBatchesForProject(orgId, projectId, 50),
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

  /*
    What has actually arrived, as opposed to what has been set up.

    The step treated "an ingest.write key exists" as "a source is connected" — the continue
    button's own doc comment said so. But minting a key moves no data; the customer's app
    still has to post events. So a project could finish the whole wizard, land on the starter
    board, and find it empty, with nothing anywhere having said that nothing was ever
    received. That is what happened on the first real customer project.

    Reading the batches is cheap and it is the only honest signal, so the step now reports it
    and the continue button below says which of the two situations the user is in.
  */
  const acceptedCount = batches.reduce((total, batch) => total + batch.accepted_count, 0);
  const quarantinedCount = batches.reduce((total, batch) => total + batch.quarantined_count, 0);
  const hasReceivedData = acceptedCount > 0;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">{t('sourceStepHeading')}</h2>
      <p className="text-muted-foreground">{t('sourceStepIntro')}</p>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">{t('sourceStepPluginHeading')}</h3>
        {connectedSourceInstall ? (
          <p className="text-sm text-muted-foreground">{t('sourceStepPluginConnected', { pluginId: connectedSourceInstall.pluginId })}</p>
        ) : installableSourceManifests.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-md border border-input p-3">
            <p className="text-sm text-muted-foreground">{t('sourceStepNoManifests')}</p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/orgs/${orgId}/plugins`}>{t('sourceStepNoManifestsLink')}</Link>
            </Button>
          </div>
        ) : (
          <InstallPluginForm orgId={orgId} projectId={projectId} manifests={installableSourceManifests} />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-medium">{t('sourceStepPushYourOwnHeading')}</h3>
        <p className="text-sm text-muted-foreground">{t('sourceStepPushYourOwnIntro')}</p>
        {environmentOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('sourceStepNoEnvironments')}</p>
        ) : (
          <CreateApiKeyForm orgId={orgId} projectId={projectId} environments={environmentOptions} ingestBaseUrl={ingestApiUrl()} />
        )}
      </div>

      <div className="flex flex-col gap-2" data-testid="onboarding-ingest-status">
        <h3 className="font-medium">{t('sourceStepDataStatusHeading')}</h3>
        {hasReceivedData ? (
          <p className="text-sm text-muted-foreground">{t('sourceStepEventsReceived', { count: acceptedCount })}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('sourceStepNoEventsYet')}</p>
        )}
        {quarantinedCount > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('sourceStepQuarantined', { count: quarantinedCount })}{' '}
            <Link className="underline" href={`/orgs/${orgId}/projects/${projectId}/ingest-health`}>
              {t('sourceStepIngestHealthLink')}
            </Link>
          </p>
        ) : null}
      </div>

      {connectedSourceInstall ? (
        <OnboardingSourceContinueButton
          orgId={orgId}
          projectId={projectId}
          method="plugin"
          pluginId={connectedSourceInstall.pluginId}
          hasReceivedData={hasReceivedData}
        />
      ) : hasIngestKey ? (
        <OnboardingSourceContinueButton
          orgId={orgId}
          projectId={projectId}
          method="push_your_own"
          hasReceivedData={hasReceivedData}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('sourceStepContinueHint')}</p>
      )}
    </section>
  );
}

/**
 * The project's confirmed funnel, read-only, with a way into the editor (KAN-199). Shown on every
 * wizard step except the funnel step itself, since a funnel can now be confirmed outside the wizard's
 * own sequence - by an agent over MCP `set_funnel` - and must not be invisible to the humans here.
 */
async function ConfirmedFunnelSummary({
  orgId,
  projectId,
  funnelSteps,
  editHref,
}: {
  orgId: string;
  projectId: string;
  funnelSteps: OnboardingStateView['funnelSteps'];
  editHref: string;
}): Promise<React.ReactElement> {
  const t = await getTranslations('Onboarding');
  const tStage = await getTranslations('Onboarding.funnelStage');
  const ordered = [...funnelSteps].sort((a, b) => a.order - b.order);

  return (
    <section className="flex flex-col gap-3" data-testid="onboarding-confirmed-funnel">
      <h2 className="text-lg font-semibold">{t('confirmedFunnelHeading')}</h2>
      <p className="text-sm text-muted-foreground">{t('confirmedFunnelIntro')}</p>
      <ol className="flex flex-col gap-1 text-sm">
        {ordered.map((step, index) => (
          <li key={step.eventSchemaName} className="flex items-center gap-2 rounded-md border border-input px-3 py-2">
            <span className="w-6 text-center text-muted-foreground">{index + 1}</span>
            <span className="font-medium" dir="ltr">
              {step.eventSchemaName}
            </span>
            <span className="text-muted-foreground">{tStage(step.stageKey)}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-4">
        <Link className="text-sm underline" href={editHref}>
          {t('confirmedFunnelEdit')}
        </Link>
        <Link className="text-sm underline" href={`/orgs/${orgId}/projects/${projectId}/funnel`}>
          {t('confirmedFunnelViewConversion')}
        </Link>
      </div>
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
