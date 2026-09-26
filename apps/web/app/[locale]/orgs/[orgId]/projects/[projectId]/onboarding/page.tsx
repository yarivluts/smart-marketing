import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { can } from '@growthos/shared';
import type { OnboardingPackKey } from '@growthos/firebase-orm-models';
import { CheckCircle2, GitMerge, Inbox, LayoutDashboard, ListChecks, Route } from 'lucide-react';
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
import { buildOnboardingJourney, wrapIntoRows } from '@/lib/orgs/onboarding-journey';
import { onboardingProgress, type OnboardingJourneyStep } from '@/lib/orgs/workspace-view';
import { StartOnboardingButton } from '@/components/orgs/start-onboarding-button';
import { OnboardingPackStep } from '@/components/orgs/onboarding-pack-step';
import { OnboardingSourceContinueButton } from '@/components/orgs/onboarding-source-continue-button';
import { OnboardingFunnelStep } from '@/components/orgs/onboarding-funnel-step';
import { CompleteOnboardingButton } from '@/components/orgs/complete-onboarding-button';
import { InstallPluginForm } from '@/components/orgs/install-plugin-form';
import { CreateApiKeyForm } from '@/components/orgs/create-api-key-form';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/viz/chart-card';
import { FlowDiagram } from '@/components/viz/flow-diagram';
import { PageHero } from '@/components/viz/page-hero';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams?: Promise<{ editFunnel?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Onboarding' });
  return { title: t('metaTitle') };
}

/** Each wizard pack's existing translated title. */
const PACK_TITLE_KEYS: Record<OnboardingPackKey, string> = {
  saas_marketing: 'packSaasMarketingTitle',
  engagement: 'packEngagementTitle',
  landing_page: 'packLandingPageTitle',
  custom: 'packCustomTitle',
};

/** A wizard step's body, framed as a card (its own heading stays inside, so tests and screen readers find it unchanged). */
function StepCard({ children, testId }: { children: React.ReactNode; testId?: string }): React.ReactElement {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm" data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * The onboarding wizard (KAN-68, plan `10 §2.6`/`13 §E13.1`): org/project already exist by the time
 * this page is reached (created via the org page's own "new project" flow, which now redirects
 * straight here) — pick a vertical/metric pack, connect a first source (or push-your-own), confirm an
 * AI-proposed funnel mapping, then land on the starter board with links to invite the team / set a
 * goal / turn on the war room. Every step's actual work happens through its own existing surface
 * (plugin install, key mint, board seeding, invites, goals, TV pairing) — this page only sequences
 * them and tracks progress, drawn as a clickable journey diagram built from the stored state and the
 * records the project really has. Gated on `project.manage`, the same permission every constituent
 * action is already reachable through for a `project_admin`.
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
  const [state, batches, boards] = await Promise.all([
    getOnboardingState(orgId, projectId),
    listRecentIngestBatchesForProject(orgId, projectId, 50),
    listBoardsForProject(orgId, projectId),
  ]);
  const view = state ? toOnboardingStateView(state) : null;
  const acceptedCount = batches.reduce((total, batch) => total + batch.accepted_count, 0);
  const numberFormat = new Intl.NumberFormat(locale);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const formatDate = (value: string | null | undefined) => (value && !Number.isNaN(Date.parse(value)) ? dateFormat.format(new Date(value)) : undefined);
  const progress = onboardingProgress(view?.step ?? null);
  const base = `/orgs/${orgId}/projects/${projectId}`;
  const onboardingHref = `${base}/onboarding`;

  const sublabels: Record<OnboardingJourneyStep, string | undefined> = {
    start: view ? t('journeyStartedOn', { date: formatDate(view.startedAt) ?? view.startedAt }) : t('journeyNotStarted'),
    pack: view?.selectedPackKey ? t(PACK_TITLE_KEYS[view.selectedPackKey]) : t('journeyPackNone'),
    sources:
      view?.sourceConnectionMethod === 'plugin'
        ? (view.connectedSourcePluginId ?? t('journeySourcePlugin'))
        : view?.sourceConnectionMethod === 'push_your_own'
          ? t('journeySourcePush')
          : t('journeySourceNone'),
    funnel: view && view.funnelSteps.length > 0 ? t('journeyFunnelSteps', { count: view.funnelSteps.length }) : t('journeyFunnelNone'),
    board: t('journeyBoards', { count: boards.length }),
    done: view?.completedAt ? t('journeyDoneOn', { date: formatDate(view.completedAt) ?? view.completedAt }) : t('journeyDoneNot'),
  };
  const values: Partial<Record<OnboardingJourneyStep, string>> = {
    sources: acceptedCount > 0 ? numberFormat.format(acceptedCount) : undefined,
    funnel: view && view.funnelSteps.length > 0 ? numberFormat.format(view.funnelSteps.length) : undefined,
    board: boards.length > 0 ? numberFormat.format(boards.length) : undefined,
  };
  const journey = buildOnboardingJourney(
    { step: view?.step ?? null },
    {
      label: (step) => t(`journeyStep_${step}`),
      sublabel: (step) => sublabels[step],
      value: (step) => values[step],
    },
    {
      pack: `${base}/plugins`,
      sources: `${base}/ingest-health`,
      funnel: view && view.funnelSteps.length > 0 && view.step !== 'funnel' ? `${onboardingHref}?editFunnel=1` : `${base}/funnel`,
      board: `${base}/boards`,
      done: `${base}/campaigns`,
    },
  );

  const hero = (
    <PageHero icon={Route} eyebrow={t('eyebrow')} title={t('title', { projectName: project.name })} description={t('introBody')}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title={t('kpiProgress')}
          value={`${progress.completed}/${progress.total}`}
          icon={ListChecks}
          progress={progress.percent}
          subtext={view?.step === 'done' ? t('kpiProgressDone') : view ? t(`journeyStep_${view.step}`) : t('journeyNotStarted')}
        />
        <StatCard title={t('kpiEvents')} value={numberFormat.format(acceptedCount)} icon={Inbox} subtext={t('kpiEventsSubtext')} />
        <StatCard title={t('kpiFunnelSteps')} value={numberFormat.format(view?.funnelSteps.length ?? 0)} icon={GitMerge} />
        <StatCard title={t('kpiBoards')} value={numberFormat.format(boards.length)} icon={LayoutDashboard} />
      </div>
    </PageHero>
  );
  const journeyCard = (
    <ChartCard title={t('journeyTitle')} description={t('journeyDescription')} icon={Route}>
      <FlowDiagram label={t('journeyTitle')} nodes={wrapIntoRows(journey.nodes, 3)} edges={journey.edges} height={300} />
    </ChartCard>
  );

  if (!view) {
    return (
      <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
        {hero}
        {journeyCard}
        <StepCard>
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">{t('startHint')}</p>
            <StartOnboardingButton orgId={orgId} projectId={projectId} />
          </div>
        </StepCard>
      </main>
    );
  }

  // The funnel editor is the wizard's own step, but a confirmed funnel stays editable from any later
  // step too (KAN-199): it can be set over MCP `set_funnel` at any time, so a human must be able to
  // review and change it here without restarting the wizard.
  const showFunnelEditor = view.step === 'funnel' || editFunnel === '1';

  return (
    <main className="container mx-auto flex max-w-6xl flex-col gap-6 py-10">
      {hero}
      {journeyCard}

      {view.step === 'pack' ? (
        <StepCard>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('packStepHeading')}</h2>
            <OnboardingPackStep orgId={orgId} projectId={projectId} packs={onboardingMetricPacks()} />
          </section>
        </StepCard>
      ) : null}

      {view.step === 'sources' ? (
        <StepCard>
          <SourcesStep orgId={orgId} projectId={projectId} />
        </StepCard>
      ) : null}

      {showFunnelEditor ? (
        <StepCard>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('funnelStepHeading')}</h2>
            <OnboardingFunnelStep
              orgId={orgId}
              projectId={projectId}
              proposal={buildFunnelEditorRows(view.funnelSteps, await proposeOnboardingFunnelSteps(orgId, projectId))}
              {...(view.step === 'funnel' ? {} : { confirmedHref: onboardingHref })}
            />
          </section>
        </StepCard>
      ) : view.funnelSteps.length > 0 ? (
        <StepCard>
          <ConfirmedFunnelSummary orgId={orgId} projectId={projectId} funnelSteps={view.funnelSteps} editHref={`${onboardingHref}?editFunnel=1`} />
        </StepCard>
      ) : null}

      {view.step === 'board' || view.step === 'done' ? (
        <StepCard>
          <FinalStep orgId={orgId} projectId={projectId} done={view.step === 'done'} />
        </StepCard>
      ) : null}
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
      <div>
        <h2 className="text-lg font-semibold">{t('sourceStepHeading')}</h2>
        <p className="text-muted-foreground">{t('sourceStepIntro')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-4">
          <h3 className="font-medium">{t('sourceStepPluginHeading')}</h3>
          {connectedSourceInstall ? (
            <p className="text-sm text-muted-foreground">{t('sourceStepPluginConnected', { pluginId: connectedSourceInstall.pluginId })}</p>
          ) : installableSourceManifests.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-input p-3">
              <p className="text-sm text-muted-foreground">{t('sourceStepNoManifests')}</p>
              <Button asChild size="sm" variant="outline">
                <Link href={`/orgs/${orgId}/plugins`}>{t('sourceStepNoManifestsLink')}</Link>
              </Button>
            </div>
          ) : (
            <InstallPluginForm orgId={orgId} projectId={projectId} manifests={installableSourceManifests} />
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-4">
          <h3 className="font-medium">{t('sourceStepPushYourOwnHeading')}</h3>
          <p className="text-sm text-muted-foreground">{t('sourceStepPushYourOwnIntro')}</p>
          {environmentOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('sourceStepNoEnvironments')}</p>
          ) : (
            <CreateApiKeyForm orgId={orgId} projectId={projectId} environments={environmentOptions} ingestBaseUrl={ingestApiUrl()} />
          )}
        </div>
      </div>

      <div
        className={
          hasReceivedData
            ? 'flex flex-col gap-2 rounded-xl border border-success/30 bg-success/5 p-4'
            : 'flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning/5 p-4'
        }
        data-testid="onboarding-ingest-status"
      >
        <h3 className="flex items-center gap-2 font-medium">
          {hasReceivedData ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : <Inbox className="h-4 w-4 text-warning" aria-hidden="true" />}
          {t('sourceStepDataStatusHeading')}
        </h3>
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
      <ol className="flex flex-wrap items-stretch gap-2 text-sm">
        {ordered.map((step, index) => (
          <li key={step.eventSchemaName} className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
            <span className="font-medium" dir="ltr">
              {step.eventSchemaName}
            </span>
            <span className="text-muted-foreground">{tStage(step.stageKey)}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-4">
        <Link className="text-sm font-medium text-primary underline" href={editHref}>
          {t('confirmedFunnelEdit')}
        </Link>
        <Link className="text-sm font-medium text-primary underline" href={`/orgs/${orgId}/projects/${projectId}/funnel`}>
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
        <ul className="grid gap-2 sm:grid-cols-3">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-3 font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                href={`/orgs/${orgId}/projects/${projectId}/boards/${board.id}`}
              >
                <LayoutDashboard className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {board.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-4">
        <Link className="text-sm font-medium text-primary underline" href={`/orgs/${orgId}`}>
          {t('inviteTeamLink')}
        </Link>
        <Link className="text-sm font-medium text-primary underline" href={`/orgs/${orgId}/projects/${projectId}/goals`}>
          {t('setGoalLink')}
        </Link>
        <Link className="text-sm font-medium text-primary underline" href={`/orgs/${orgId}/projects/${projectId}/tv`}>
          {t('warRoomLink')}
        </Link>
      </div>

      {done ? (
        <p className="flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
          {t('doneMessage')}
        </p>
      ) : (
        <CompleteOnboardingButton orgId={orgId} projectId={projectId} />
      )}
    </section>
  );
}
