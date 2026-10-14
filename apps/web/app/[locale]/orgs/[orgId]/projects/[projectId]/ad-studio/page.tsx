import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  assemblyPlan,
  can,
  sceneVideoStates,
  summarizeVideoProgress,
  totalSceneSeconds,
  voiceDescription,
} from '@growthos/shared';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Clock,
  FileText,
  Film,
  ImageIcon,
  Plus,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
import { isMetaOAuthConfigured, metaConnectHref } from '@/lib/integrations/meta';
import { findActiveMembership } from '@/lib/orgs/access';
import { listOrgProjects } from '@/lib/orgs/queries';
import {
  getAdStudioKeywordDataStatus,
  getAdStudioSettings,
  getAdStudioUsageToday,
  listAdStudioBriefs,
  listAdStudioClips,
  listAdStudioUsage,
  listAdStudioVideos,
  listAdStudioExports,
  resolveAdStudioExportDestinations,
  toAdStudioExportView,
  toAdStudioBriefView,
  getLatestAdStudioRunView,
  loadAdStudioBrandKit,
} from '@/lib/ad-studio/store';
import {
  describeAdStudioProviders,
  toAdStudioClipView,
  toAdStudioVideoView,
  resolveAdStudioMediaStorage,
  isFfmpegAvailable,
  resolveAdStudioOmni,
  resolveAdStudioImageGenerator,
  listBriefImages,
  listBriefReferences,
} from '@/lib/ad-studio/engine';
import {
  adStudioImageSlots,
  adStudioStages,
  currentAssembledVideo,
  limitUsedPercent,
  summarizeAdStudio,
  type AdStudioStageStatus,
  type AdStudioVideoStageProgress,
} from '@/lib/ad-studio/view';
import { Link } from '@/i18n/navigation';
import { StatCard } from '@/components/ui/stat-card';
import {
  ChartCard,
  EmptyState,
  FlowDiagram,
  PageHero,
  type FlowEdgeSpec,
  type FlowNodeSpec,
  type VizStatus,
} from '@/components/viz';
import { BriefForm } from '@/components/ad-studio/brief-form';
import { ScriptEditor } from '@/components/ad-studio/script-editor';
import { ReferenceLibrary } from '@/components/ad-studio/reference-library';
import { VideoStudio } from '@/components/ad-studio/video-studio';
import { ExportPanel } from '@/components/ad-studio/export-panel';
import { SceneTimeline } from '@/components/ad-studio/scene-timeline';
import { AdStudioAdminPanel } from '@/components/ad-studio/ad-studio-admin-panel';
import { BrandKitPanel } from '@/components/ad-studio/brand-kit-panel';
import { BrandLogoProvider } from '@/components/ad-studio/brand-logo';
import { PlanningPanel } from '@/components/ad-studio/planning-panel';
import { KeywordResearch } from '@/components/ad-studio/keyword-research';
import { SearchAdEditor } from '@/components/ad-studio/search-ad-editor';
import { AudiencePanel } from '@/components/ad-studio/audience-panel';
import { DeleteBriefButton } from '@/components/ad-studio/delete-brief-button';
import { AutopilotPanel } from '@/components/ad-studio/autopilot-panel';
import { ImageStudio } from '@/components/ad-studio/image-studio';
import { PublishPanel, type PublishCreative } from '@/components/ad-studio/publish-panel';
import {
  AdStudioStepper,
  type AdStudioStepId,
  type AdStudioStepNav,
} from '@/components/ad-studio/ad-studio-stepper';
import { cn } from '@/lib/utils';
import { CreateGallery } from '@/components/ad-studio/create-gallery';
import { ReviewOverview } from '@/components/ad-studio/review-overview';
import { AdHeader } from '@/components/ad-studio/ad-header';
import { adTextDirection, displayHost, parseReviewItem, reviewItemParam, summarizeImageCreatives, summarizeSearchCreative, summarizeVideoCreative, type ReviewItem } from '@/lib/ad-studio/review-overview';
import { PlanSection } from '@/components/ad-studio/plan-section';
import { ClaimSourcesProvider } from '@/components/ad-studio/claim-sources';
import { planAdStudioSteps, resolveAdStudioStep } from '@/lib/ad-studio/steps';
import { isPlatformOperator } from '@/lib/auth/platform-operator';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams: Promise<{ brief?: string; step?: string; item?: string; open?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdStudio' });
  return { title: t('metaTitle') };
}

const STAGE_STATUS: Record<AdStudioStageStatus, VizStatus> = {
  done: 'ok',
  current: 'warn',
  upcoming: 'idle',
  skipped: 'idle',
};

/**
 * The AI Ad Studio (KAN-229): briefs, a deep analysis of the evidence behind each ad (KAN-230),
 * AI-written scripts split into scenes of 3-10 seconds (at most 60 seconds in all) that a person
 * edits scene by scene, and the studio's admin surface - which models it uses, whether keyword data
 * is available, and the project's daily AI limits. Gated on `ai.use`; limits need `project.configure`.
 */
/** The seeds a keyword lookup starts from: the plan's theme keywords, else the ad's name. */
function keywordSeedsFor(brief: { name: string; plan: { keywordThemes: { keywords: string[] }[] } | null }): string[] {
  const fromPlan = brief.plan?.keywordThemes.flatMap((theme) => theme.keywords) ?? [];
  return [...new Set(fromPlan.length ? fromPlan : [brief.name])].slice(0, 10);
}

export default async function AdStudioPage({
  params,
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { brief: selectedBriefId, step: requestedStep, item: requestedItem, open: requestedSection } = await searchParams;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (!session) {
    redirect(`/${locale}/login?from=%2Forgs%2F${orgId}%2Fprojects%2F${projectId}%2Fad-studio`);
  }
  const { user, memberships, bindings } = await resolveOrgSessionContext(session);
  const principal = { type: 'user' as const, id: user.id };
  const membership = findActiveMembership(memberships, orgId);
  if (!membership || !can(bindings, principal, 'ai.use', { orgId, projectId })) {
    notFound();
  }
  // The daily AI limits cap platform spend, and the models/storage/ffmpeg are platform internals:
  // both belong to a GrowthOS platform operator, not to the customer's project admin (KAN-363).
  const canConfigure = can(bindings, principal, 'project.configure', { orgId, projectId }) && isPlatformOperator(user.email);
  const canExport = can(bindings, principal, 'automation.execute', { orgId, projectId });
  const canConnectAccounts =
    can(bindings, principal, 'resources.manage', { orgId, projectId }) && isMetaOAuthConfigured();

  const canEditBrand = can(bindings, principal, 'project.configure', { orgId, projectId });
  const [projects, briefModels, settings, usageToday, recentUsage, keywordData, ffmpegAvailable, brandLoaded] =
    await Promise.all([
      listOrgProjects(orgId),
      listAdStudioBriefs(orgId, projectId),
      getAdStudioSettings(orgId, projectId),
      getAdStudioUsageToday(orgId, projectId),
      listAdStudioUsage(orgId, projectId, 25),
      getAdStudioKeywordDataStatus(orgId, projectId),
      isFfmpegAvailable(),
      loadAdStudioBrandKit(orgId, projectId),
    ]);
  const brandKit = brandLoaded.kit;
  const logoUrl = brandLoaded.logoVersion ? `/api/orgs/${orgId}/projects/${projectId}/ad-studio/brand-kit/logo?v=${encodeURIComponent(brandLoaded.logoVersion)}` : null;
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) notFound();

  const t = await getTranslations('AdStudio');
  const briefs = briefModels.map(toAdStudioBriefView);
  const selected = selectedBriefId
    ? briefs.find((brief) => brief.id === selectedBriefId)
    : undefined;
  if (selectedBriefId && !selected) notFound();
  const overview = summarizeAdStudio(briefs);
  const providers = describeAdStudioProviders();
  const base = `/orgs/${orgId}/projects/${projectId}/ad-studio`;
  const videoAvailable = resolveAdStudioOmni() !== null;
  const imagesAvailable = resolveAdStudioImageGenerator() !== null;
  const storage = resolveAdStudioMediaStorage().describe();

  // The selected ad's clips and assembled videos, and how far its video stage has come.
  const [clipModels, videoModels, exportRows, exportDestinations, images, latestRun, references] =
    selected
      ? await Promise.all([
          listAdStudioClips(orgId, projectId, selected.id),
          listAdStudioVideos(orgId, projectId, selected.id),
          listAdStudioExports(orgId, projectId, selected.id),
          resolveAdStudioExportDestinations(orgId, projectId),
          listBriefImages({ organizationId: orgId, projectId, briefId: selected.id }),
          getLatestAdStudioRunView(orgId, projectId, selected.id),
          listBriefReferences({ organizationId: orgId, projectId, briefId: selected.id }),
        ])
      : [[], [], [], null, [], null, []];
  const exportsView = exportRows.map(toAdStudioExportView);
  const uploadedCount = exportsView.filter((row) => row.status === 'done').length;
  const videoExports = exportsView
    .filter((row) => row.mediaKind === 'video' && row.destination !== 'google_ads')
    .map((row) => ({ ...row, destination: row.destination as 'meta' | 'youtube' }));
  const imageExports = exportsView.filter((row) => row.mediaKind === 'image');
  const imageSlots = selected
    ? adStudioImageSlots(selected.imageConcepts, images, selected.language)
    : [];
  const imageProgress = {
    current: imageSlots.filter((slot) => slot.current).length,
    total: imageSlots.length,
  };
  const clips = clipModels.map(toAdStudioClipView);
  const videos = videoModels.map(toAdStudioVideoView);
  let videoStage: (AdStudioVideoStageProgress & { assembledSeconds: number | null }) | undefined;
  let exportableVideo: { id: string; durationSeconds: number } | null = null;
  if (selected) {
    const context = { format: selected.format, language: selected.language, voice: voiceDescription(selected.voice), settings: selected.videoSettings };
    const progress = summarizeVideoProgress(
      sceneVideoStates(selected.scenes, clips, context),
      selected.scenes,
    );
    const assembly = assemblyPlan(selected.scenes, clips, context);
    const assembled = currentAssembledVideo(
      videos,
      assembly?.map((entry) => entry.clip.id) ?? null,
    );
    videoStage = {
      rendered: progress.rendered,
      scenes: progress.scenes,
      assembled: assembled.current,
      assembledSeconds: assembled.current ? (assembled.latest?.durationSeconds ?? null) : null,
    };
    // Only the current assembled video is offered for export - never one made from out-of-date clips.
    if (assembled.current && assembled.latest)
      exportableVideo = {
        id: assembled.latest.id,
        durationSeconds: assembled.latest.durationSeconds,
      };
  }

  const stageNodes: FlowNodeSpec[] = selected
    ? adStudioStages(selected, videoStage, uploadedCount > 0, imageProgress).map((stage) => ({
        id: stage.id,
        label: t(`stage.${stage.id}`),
        sublabel: t(`stageStatus.${stage.status}`),
        value:
          stage.id === 'script' && selected.scenes.length > 0
            ? t('stageScriptValue', {
                scenes: selected.scenes.length,
                seconds: totalSceneSeconds(selected.scenes),
              })
            : stage.id === 'plan' && selected.plan
              ? t('stagePlanValue', { count: selected.plan.recommendations.length })
              : stage.id === 'brief'
                ? t(
                    selected.format === 'vertical'
                      ? 'formatVerticalShort'
                      : 'formatHorizontalShort',
                  )
                : stage.id === 'images' && imageProgress.total > 0
                  ? t('stageImagesValue', imageProgress)
                  : stage.id === 'video' && videoStage && selected.scenes.length > 0
                    ? videoStage.assembled
                      ? t('stageVideoAssembled', {
                          seconds: Math.round((videoStage.assembledSeconds ?? 0) * 10) / 10,
                        })
                      : t('stageVideoValue', {
                          rendered: videoStage.rendered,
                          total: videoStage.scenes,
                        })
                    : stage.id === 'export' && uploadedCount > 0
                      ? t('stageExportValue', { count: uploadedCount })
                      : undefined,
        status: STAGE_STATUS[stage.status],
      }))
    : [];
  const stageEdges: FlowEdgeSpec[] = stageNodes.slice(1).map((node, index) => ({
    source: stageNodes[index].id,
    target: node.id,
    animated: node.status === 'warn',
    status: node.status,
  }));

  // The stepper (Brief -> Plan -> Create -> Review -> Publish): each step's state, and which one to
  // open when the URL names none - the one that needs the person's attention next.
  const hasMedia =
    images.some((image) => image.status === 'ready') ||
    clips.some((clip) => clip.status === 'ready');
  // A saved script or saved ideas count as a plan: writing by hand must not depend on the autopilot.
  const hasContent = Boolean(selected && (selected.scenes.length > 0 || selected.imageConcepts.length > 0));
  const conceptIndex = (conceptId: string) =>
    (selected?.imageConcepts.findIndex((concept) => concept.id === conceptId) ?? 0) + 1;
  const mediaBase = `/api/orgs/${orgId}/projects/${projectId}/ad-studio/briefs/${selected?.id}`;
  const publishCreatives: PublishCreative[] = [
    ...imageSlots.flatMap((slot) =>
      slot.selected && slot.current
        ? [
            {
              key: `${slot.conceptId}-${slot.format}`,
              kind: 'image' as const,
              id: slot.selected.id,
              label: `${t('images.ideaLabel', { index: conceptIndex(slot.conceptId) })} · ${t(`images.format.${slot.format}`)}`,
              previewSrc: `${mediaBase}/images/${slot.selected.id}/media`,
              copy:
                selected?.imageConcepts.find((concept) => concept.id === slot.conceptId)?.copy ??
                null,
              format: slot.format,
            },
          ]
        : [],
    ),
    ...(exportableVideo
      ? [
          {
            key: 'video',
            kind: 'video' as const,
            id: exportableVideo.id,
            label: t('publish.video'),
            previewSrc: `${mediaBase}/videos/${exportableVideo.id}/media`,
            copy: selected?.videoCopy ?? null,
            vertical: selected?.format === 'vertical',
          },
        ]
      : []),
    // The search ad, once written: published to Google Search with its keywords.
    ...(selected?.searchAd
      ? [
          {
            key: 'search',
            kind: 'search' as const,
            id: 'search',
            label: t('publish.searchAd'),
            previewSrc: '',
            search: { ...selected.searchAd, keywordCount: selected.searchKeywords?.keywords.length ?? 0 },
          },
        ]
      : []),
  ];
  const publishedAds = exportsView.filter((row) => row.resultKind === 'ad');
  const steps = planAdStudioSteps({
    hasMedia,
    hasContent,
    run: latestRun ? { status: latestRun.status, planApproved: Boolean(latestRun.planApprovedOn) } : null,
    publishable: publishCreatives.length,
    published: publishedAds.length,
  });
  const { planConfirmed } = steps;
  const stepHref = (id: AdStudioStepId) => `${base}?brief=${selected?.id}&step=${id}`;
  // Review opens on an overview of the creatives; ?item= opens one of them (or all image ideas).
  const reviewItem = parseReviewItem(requestedItem);
  const reviewHref = (item: ReviewItem) => `${stepHref('review')}&item=${encodeURIComponent(reviewItemParam(item))}`;
  const stepNav: AdStudioStepNav[] | null = selected
    ? [
        {
          id: 'brief',
          label: t('stepper.brief.label'),
          hint: t('stepper.brief.hint'),
          state: 'done',
          href: stepHref('brief'),
        },
        {
          id: 'plan',
          label: t('stepper.plan.label'),
          hint: planConfirmed ? t('stepper.plan.hintDone') : t('stepper.plan.hint'),
          state: steps.states.plan,
          href: stepHref('plan'),
        },
        {
          id: 'create',
          label: t('stepper.create.label'),
          hint: planConfirmed ? t('stepper.create.hint') : t('stepper.create.hintLocked'),
          state: steps.states.create,
          href: stepHref('create'),
        },
        {
          id: 'review',
          label: t('stepper.review.label'),
          hint: steps.states.review !== 'locked' ? t('stepper.review.hint') : t('stepper.review.hintLocked'),
          state: steps.states.review,
          href: stepHref('review'),
        },
        {
          id: 'publish',
          label: t('stepper.publish.label'),
          hint: publishCreatives.length
            ? t('stepper.publish.hint')
            : t('stepper.publish.hintLocked'),
          state: steps.states.publish,
          href: stepHref('publish'),
        },
      ]
    : null;
  const activeStep: AdStudioStepId = resolveAdStudioStep(steps, requestedStep);
  const activeIndex = stepNav?.findIndex((entry) => entry.id === activeStep) ?? 0;
  const previousStep = stepNav && activeIndex > 0 ? stepNav[activeIndex - 1] : null;
  const nextStep = stepNav && activeIndex < stepNav.length - 1 ? stepNav[activeIndex + 1] : null;

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-8">
      {selected ? (
        <AdHeader
          studioLabel={t('eyebrow')}
          allAds={{ label: t('backToAds'), href: base }}
          name={selected.name}
          objective={selected.objective}
          actions={<DeleteBriefButton orgId={orgId} projectId={projectId} briefId={selected.id} afterDeleteHref={base} />}
          usage={{
            label: t('adHeader.usageLabel'),
            limitReached: t('adHeader.limitReached'),
            meters: [
              { key: 'images', label: t('usageTodayImages'), used: usageToday.images, limit: settings.dailyImages, icon: ImageIcon },
              { key: 'text', label: t('kpiTextToday'), used: usageToday.textGenerations, limit: settings.dailyTextGenerations, icon: Sparkles },
              { key: 'video', label: t('kpiVideoToday'), used: usageToday.videoSeconds, limit: settings.dailyVideoSeconds, icon: Clock },
            ],
          }}
        />
      ) : (
      <PageHero
        icon={Clapperboard}
        eyebrow={t('eyebrow')}
        title={t('title', { project: project.name })}
        description={t('description')}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard title={t('kpiAds')} value={overview.briefs} icon={FileText} />
          <StatCard
            title={t('kpiScripted')}
            value={overview.scripted}
            icon={Film}
            subtext={t('kpiScriptedHint', { seconds: overview.scriptedSeconds })}
          />
          <StatCard
            title={t('kpiTextToday')}
            value={usageToday.textGenerations}
            icon={Sparkles}
            subtext={t('kpiOfLimit', { limit: settings.dailyTextGenerations })}
            progress={limitUsedPercent(usageToday.textGenerations, settings.dailyTextGenerations)}
          />
          <StatCard
            title={t('kpiVideoToday')}
            value={usageToday.videoSeconds}
            icon={Clock}
            subtext={t('kpiOfLimit', { limit: settings.dailyVideoSeconds })}
            progress={limitUsedPercent(usageToday.videoSeconds, settings.dailyVideoSeconds)}
          />
          <StatCard
            title={t('usageTodayImages')}
            value={usageToday.images}
            icon={ImageIcon}
            subtext={t('kpiOfLimit', { limit: settings.dailyImages })}
            progress={limitUsedPercent(usageToday.images, settings.dailyImages)}
          />
        </div>
      </PageHero>
      )}

      {!providers.text ? (
        <p
          className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
          role="status"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {t('providerNotConfigured')}
        </p>
      ) : null}

      {selected && stepNav ? (
        <BrandLogoProvider url={logoUrl}>
        <ClaimSourcesProvider sources={[selected.name, selected.objective, selected.productDescription, selected.plan?.landingPageSummary ?? '']}>
          <AdStudioStepper steps={stepNav} active={activeStep} label={t('stepper.label')} />

          {activeStep === 'brief' ? (
            <ChartCard
              title={t('stepper.brief.title')}
              description={t('stepper.brief.description')}
              icon={FileText}
            >
              <BriefForm
                orgId={orgId}
                projectId={projectId}
                briefId={selected.id}
                initial={{
                  name: selected.name,
                  objective: selected.objective,
                  productDescription: selected.productDescription,
                  landingPageUrl: selected.landingPageUrl ?? '',
                  format: selected.format,
                  language: selected.language,
                  targetSeconds: selected.targetSeconds,
                }}
              />
            </ChartCard>
          ) : null}

          {activeStep === 'plan' ? (
            <>
              <AutopilotPanel
                mode="prepare"
                orgId={orgId}
                projectId={projectId}
                briefId={selected.id}
                initialRun={latestRun}
                has={{
                  plan: Boolean(selected.plan),
                  script: selected.scenes.length > 0,
                  concepts: selected.imageConcepts.length > 0,
                }}
                available={{
                  text: providers.text !== null,
                  images: imagesAvailable,
                  video: videoAvailable,
                }}
                stepHrefs={{ create: stepHref('create'), review: stepHref('review') }}
              />
              <PlanningPanel
                orgId={orgId}
                projectId={projectId}
                briefId={selected.id}
                plan={selected.plan}
                sources={selected.planSources}
                generatedBy={selected.planGeneratedBy}
                aiAvailable={providers.text !== null}
              />
              {/* Research tools fold away behind one line each; the plan, script and ideas stay in front. */}
              <PlanSection
                title={t('planSections.keywords')}
                state={selected.searchKeywords?.keywords.length ? t('planSections.keywordsChosen', { count: selected.searchKeywords.keywords.length }) : t('planSections.notSet')}
                testId="ad-studio-plan-keywords"
                defaultOpen={requestedSection === 'keywords'}
              >
                <KeywordResearch
                  orgId={orgId}
                  projectId={projectId}
                  briefId={selected.id}
                  language={selected.language}
                  landingPageUrl={selected.landingPageUrl}
                  initial={selected.searchKeywords}
                  suggestedSeeds={keywordSeedsFor(selected)}
                />
              </PlanSection>
              <PlanSection
                title={t('planSections.audience')}
                state={selected.metaTargeting ? t('planSections.audienceSet') : t('planSections.notSet')}
                testId="ad-studio-plan-audience"
              >
                <AudiencePanel
                  orgId={orgId}
                  projectId={projectId}
                  briefId={selected.id}
                  language={selected.language}
                  initial={selected.metaTargeting}
                />
              </PlanSection>
              <PlanSection
                title={t('planSections.references')}
                state={references.length ? t('planSections.referencesCount', { count: references.length }) : t('planSections.notSet')}
                testId="ad-studio-plan-references"
              >
                <ReferenceLibrary
                  orgId={orgId}
                  projectId={projectId}
                  briefId={selected.id}
                  initialReferences={references}
                  illustrationAvailable={imagesAvailable}
                />
              </PlanSection>
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <ScriptEditor
                  orgId={orgId}
                  projectId={projectId}
                  briefId={selected.id}
                  initialScenes={selected.scenes}
                  generatedByModel={selected.scriptGeneratedBy?.model ?? null}
                  aiAvailable={providers.text !== null}
                  language={selected.language}
                  references={references}
                />
              </div>
              <ImageStudio
                ideasOnly
                orgId={orgId}
                projectId={projectId}
                briefId={selected.id}
                briefName={selected.name}
                advertiser={brandKit.brandName || selected.name}
                language={selected.language}
                initialConcepts={selected.imageConcepts}
                initialImages={images}
                imagesAvailable={imagesAvailable}
                textAvailable={providers.text !== null}
                imagesLeftToday={Math.max(0, settings.dailyImages - usageToday.images)}
                canExport={canExport}
                destinations={{
                  meta: Boolean(exportDestinations?.meta.available),
                  google_ads: Boolean(exportDestinations?.google_ads.available),
                }}
                exports={imageExports}
                linkUrl={selected.landingPageUrl}
              />
            </>
          ) : null}

          {activeStep === 'create' ? (
            <>
              <AutopilotPanel
                mode="progress"
                orgId={orgId}
                projectId={projectId}
                briefId={selected.id}
                initialRun={latestRun}
                has={{
                  plan: Boolean(selected.plan),
                  script: selected.scenes.length > 0,
                  concepts: selected.imageConcepts.length > 0,
                }}
                available={{
                  text: providers.text !== null,
                  images: imagesAvailable,
                  video: videoAvailable,
                }}
                stepHrefs={{ create: stepHref('create'), review: stepHref('review') }}
              />
              <CreateGallery
                mediaBase={mediaBase}
                videoFormat={selected.format}
                images={imageSlots.flatMap((slot) => {
                  const latest = slot.selected ?? slot.versions[0];
                  return latest ? [{ id: latest.id, status: latest.status, format: slot.format, label: `${t('images.ideaLabel', { index: conceptIndex(slot.conceptId) })} · ${t(`images.format.${slot.format}`)}` }] : [];
                })}
                scenes={selected.scenes.map((scene, index) => {
                  const latest = clips.filter((clip) => clip.sceneId === scene.id).sort((a, b) => b.version - a.version)[0];
                  return { id: scene.id, number: index + 1, clip: latest ? { id: latest.id, status: latest.status } : null };
                })}
              />
              <ChartCard
                title={t('pipelineTitle')}
                description={t('pipelineDescription')}
                icon={Workflow}
              >
                <FlowDiagram
                  label={t('pipelineTitle')}
                  nodes={stageNodes}
                  edges={stageEdges}
                  height={200}
                />
              </ChartCard>
            </>
          ) : null}

          {activeStep === 'review' && !reviewItem ? (
            <ReviewOverview
              mediaBase={mediaBase}
              videoFormat={selected.format}
              adDirection={adTextDirection(selected.language)}
              hrefs={{
                image: Object.fromEntries(selected.imageConcepts.map((concept) => [concept.id, reviewHref({ kind: 'image', conceptId: concept.id })])),
                images: reviewHref({ kind: 'images' }),
                video: reviewHref({ kind: 'video' }),
                search: reviewHref({ kind: 'search' }),
              }}
              images={summarizeImageCreatives(selected.imageConcepts, imageSlots)}
              video={summarizeVideoCreative({
                scenes: selected.scenes,
                clips,
                assembled: Boolean(videoStage?.assembled),
                assembledSeconds: videoStage?.assembledSeconds ?? 0,
                hasCopy: Boolean(selected.videoCopy && (selected.videoCopy.headline.trim() || selected.videoCopy.primaryText.trim())),
              })}
              search={summarizeSearchCreative(selected.searchAd, selected.searchKeywords?.keywords.length ?? 0)}
              publishHref={steps.states.publish !== 'locked' ? stepHref('publish') : null}
              searchHost={displayHost(selected.landingPageUrl)}
            />
          ) : null}

          {activeStep === 'review' && reviewItem ? (
            <>
              {/* One creative's own page: everything about it, editable, and the way back to all of them. */}
              <Link
                href={stepHref('review')}
                className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary hover:underline"
                data-testid="ad-studio-review-back"
              >
                <ArrowRight className="h-4 w-4 ltr:rotate-180" aria-hidden="true" />
                {t('review.back')}
              </Link>
              {reviewItem.kind === 'image' || reviewItem.kind === 'images' ? (
              <ImageStudio
                focusConceptId={reviewItem.kind === 'image' ? reviewItem.conceptId : undefined}
                orgId={orgId}
                projectId={projectId}
                briefId={selected.id}
                briefName={selected.name}
                advertiser={brandKit.brandName || selected.name}
                language={selected.language}
                initialConcepts={selected.imageConcepts}
                initialImages={images}
                imagesAvailable={imagesAvailable}
                textAvailable={providers.text !== null}
                imagesLeftToday={Math.max(0, settings.dailyImages - usageToday.images)}
                canExport={canExport}
                destinations={{
                  meta: Boolean(exportDestinations?.meta.available),
                  google_ads: Boolean(exportDestinations?.google_ads.available),
                }}
                exports={imageExports}
                linkUrl={selected.landingPageUrl}
              />
              ) : null}
              {reviewItem.kind === 'video' ? (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <VideoStudio
                  orgId={orgId}
                  projectId={projectId}
                  briefId={selected.id}
                  scenes={selected.scenes}
                  format={selected.format}
                  language={selected.language}
                  initialClips={clips}
                  initialVideos={videos}
                  videoAvailable={videoAvailable}
                  videoSecondsLeft={Math.max(
                    0,
                    settings.dailyVideoSeconds - usageToday.videoSeconds,
                  )}
                  videoCopy={selected.videoCopy}
                  voice={selected.voice}
                  videoSettings={selected.videoSettings}
                  advertiser={brandKit.brandName || selected.name}
                  textAvailable={providers.text !== null}
                  linkUrl={selected.landingPageUrl}
                />
              </div>
              ) : null}
              {reviewItem.kind === 'search' ? (
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <SearchAdEditor
                  orgId={orgId}
                  projectId={projectId}
                  briefId={selected.id}
                  initial={selected.searchAd}
                  keywordCount={selected.searchKeywords?.keywords.length ?? 0}
                  keywordsHref={`${stepHref('plan')}&open=keywords`}
                  linkUrl={selected.landingPageUrl}
                  advertiser={brandKit.brandName || selected.name}
                  aiAvailable={providers.text !== null}
                />
              </div>
              ) : null}
            </>
          ) : null}

          {activeStep === 'publish' ? (
            <>
              <PublishPanel
                orgId={orgId}
                projectId={projectId}
                briefId={selected.id}
                briefName={selected.name}
                defaultLink={selected.landingPageUrl ?? ''}
                defaultPrimaryText={selected.objective}
                metaTargeting={selected.metaTargeting}
                creatives={publishCreatives}
                destinations={{
                  meta: Boolean(exportDestinations?.meta.available),
                  google_ads: Boolean(exportDestinations?.google_ads.available),
                }}
                canPublish={canExport}
                published={publishedAds}
                resourcesHref={`/orgs/${orgId}/projects/${projectId}/resources`}
                metaConnectHref={
                  canConnectAccounts
                    ? metaConnectHref({
                        orgId,
                        projectId,
                        locale,
                        returnTo: `/${locale}/orgs/${orgId}/projects/${projectId}/ad-studio?brief=${selected.id}&step=publish`,
                      })
                    : null
                }
              />
              {exportDestinations ? (
                <details className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <summary className="cursor-pointer text-sm font-semibold">
                    {t('stepper.publish.libraryUploads')}
                  </summary>
                  <div className="mt-4">
                    <ExportPanel
                      orgId={orgId}
                      projectId={projectId}
                      briefId={selected.id}
                      video={exportableVideo}
                      destinations={{
                        meta: exportDestinations.meta.available
                          ? {
                              available: true,
                              credentialName: exportDestinations.meta.credentialName,
                            }
                          : { available: false, reason: exportDestinations.meta.reason },
                        youtube: exportDestinations.youtube.available
                          ? {
                              available: true,
                              credentialName: exportDestinations.youtube.credentialName,
                            }
                          : { available: false, reason: exportDestinations.youtube.reason },
                      }}
                      exports={videoExports}
                      canExport={canExport}
                      defaultTitle={selected.name}
                      defaultDescription={selected.objective}
                      resourcesHref={`/orgs/${orgId}/projects/${projectId}/resources`}
                    />
                  </div>
                </details>
              ) : null}
            </>
          ) : null}

          <nav
            className="z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/95 p-2 shadow-soft backdrop-blur md:sticky md:bottom-3"
            aria-label={t('stepper.footerLabel')}
            data-testid="ad-studio-step-footer"
          >
            {previousStep ? (
              <Link
                href={stepHref(previousStep.id)}
                className="inline-flex h-11 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-5 text-sm font-semibold text-primary hover:bg-primary/10"
              >
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                {t('stepper.back', { step: previousStep.label })}
              </Link>
            ) : (
              <span />
            )}
            {nextStep && nextStep.state !== 'locked' ? (
              <Link
                href={stepHref(nextStep.id)}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-glow hover:bg-primary/90"
              >
                {t('stepper.next', { step: nextStep.label })}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            ) : nextStep ? (
              <span className="px-3 text-xs text-muted-foreground">{nextStep.hint}</span>
            ) : null}
          </nav>
        </ClaimSourcesProvider>
        </BrandLogoProvider>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <ChartCard title={t('newAdTitle')} description={t('newAdDescription')} icon={Plus}>
            <BriefForm orgId={orgId} projectId={projectId} studioHref={base} />
          </ChartCard>

          {/* On phones the person's existing ads come first; the new-ad form follows. */}
          <section className="order-first flex flex-col gap-3 lg:order-none" aria-labelledby="ad-studio-ads-heading">
            <h2 id="ad-studio-ads-heading" className="text-lg font-semibold">
              {t('adsListTitle')}
            </h2>
            {briefs.length === 0 ? (
              <EmptyState
                icon={Clapperboard}
                title={t('adsListEmptyTitle')}
                description={t('adsListEmpty')}
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {briefs.map((brief) => (
                  <li key={brief.id}>
                    <Link
                      href={`${base}?brief=${brief.id}`}
                      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
                      data-testid="ad-studio-brief-card"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{brief.name}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {brief.objective}
                          </p>
                        </div>
                        <span className="flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t(
                              brief.format === 'vertical'
                                ? 'formatVerticalShort'
                                : 'formatHorizontalShort',
                            )}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-medium',
                              brief.scenes.length > 0
                                ? 'bg-success/10 text-success'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {t(`status.${brief.status}`)}
                          </span>
                        </span>
                      </div>
                      {brief.scenes.length > 0 ? (
                        <SceneTimeline scenes={brief.scenes} />
                      ) : (
                        <p className="text-xs text-muted-foreground">{t('noScenesYetShort')}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Studio-wide settings and usage: open on the studio home, one line under an open ad. */}
      <details open={!selected} className="group rounded-2xl" data-testid="ad-studio-admin-details">
        <summary
          className={cn(
            'cursor-pointer rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-sm',
            !selected && 'sr-only',
          )}
        >
          {t('admin.collapsed')}
        </summary>
        <BrandKitPanel orgId={orgId} projectId={projectId} initial={brandKit} canEdit={canEditBrand} logoUrl={logoUrl} />
        <AdStudioAdminPanel
          orgId={orgId}
          projectId={projectId}
          canConfigure={canConfigure}
          textModel={providers.text}
          videoConfigured={providers.videoConfigured}
          keywordData={keywordData}
          storage={storage}
          ffmpegAvailable={ffmpegAvailable}
          limits={{
            dailyTextGenerations: settings.dailyTextGenerations,
            dailyVideoSeconds: settings.dailyVideoSeconds,
            dailyImages: settings.dailyImages,
          }}
          videoQa={settings.videoQa}
          imageSize={settings.imageSize}
          usageToday={usageToday}
          recentUsage={recentUsage.map((row) => ({
            id: row.id,
            kind: row.kind,
            provider: row.provider,
            model: row.model,
            units: row.units,
            outcome: row.outcome,
            failureReason: row.failure_reason ?? null,
            occurredOn: row.occurred_on,
          }))}
        />
      </details>
    </div>
  );
}
