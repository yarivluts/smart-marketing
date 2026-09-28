import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { assemblyPlan, can, sceneVideoStates, summarizeVideoProgress, totalSceneSeconds } from '@growthos/shared';
import { AlertTriangle, ArrowLeft, Clapperboard, Clock, FileText, Film, Plus, Sparkles, Workflow } from 'lucide-react';
import { getServerSession } from '@/lib/auth/get-server-session';
import { resolveOrgSessionContext } from '@/lib/orgs/session-context';
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
} from '@/lib/ad-studio/store';
import { describeAdStudioProviders, toAdStudioClipView, toAdStudioVideoView, resolveAdStudioMediaStorage, isFfmpegAvailable, resolveAdStudioOmni } from '@/lib/ad-studio/engine';
import { adStudioStages, currentAssembledVideo, limitUsedPercent, summarizeAdStudio, type AdStudioStageStatus, type AdStudioVideoStageProgress } from '@/lib/ad-studio/view';
import { Link } from '@/i18n/navigation';
import { StatCard } from '@/components/ui/stat-card';
import { ChartCard, EmptyState, FlowDiagram, PageHero, type FlowEdgeSpec, type FlowNodeSpec, type VizStatus } from '@/components/viz';
import { BriefForm } from '@/components/ad-studio/brief-form';
import { ScriptEditor } from '@/components/ad-studio/script-editor';
import { VideoStudio } from '@/components/ad-studio/video-studio';
import { ExportPanel } from '@/components/ad-studio/export-panel';
import { SceneTimeline } from '@/components/ad-studio/scene-timeline';
import { AdStudioAdminPanel } from '@/components/ad-studio/ad-studio-admin-panel';
import { PlanningPanel } from '@/components/ad-studio/planning-panel';
import { DeleteBriefButton } from '@/components/ad-studio/delete-brief-button';
import { cn } from '@/lib/utils';

type PageProps = Readonly<{
  params: Promise<{ locale: string; orgId: string; projectId: string }>;
  searchParams: Promise<{ brief?: string }>;
}>;

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AdStudio' });
  return { title: t('metaTitle') };
}

const STAGE_STATUS: Record<AdStudioStageStatus, VizStatus> = { done: 'ok', current: 'warn', upcoming: 'idle', skipped: 'idle' };

/**
 * The AI Ad Studio (KAN-229): briefs, a deep analysis of the evidence behind each ad (KAN-230),
 * AI-written scripts split into scenes of 3-10 seconds (at most 60 seconds in all) that a person
 * edits scene by scene, and the studio's admin surface - which models it uses, whether keyword data
 * is available, and the project's daily AI limits. Gated on `ai.use`; limits need `project.configure`.
 */
export default async function AdStudioPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { locale, orgId, projectId } = await params;
  const { brief: selectedBriefId } = await searchParams;
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
  const canConfigure = can(bindings, principal, 'project.configure', { orgId, projectId });
  const canExport = can(bindings, principal, 'automation.execute', { orgId, projectId });

  const [projects, briefModels, settings, usageToday, recentUsage, keywordData, ffmpegAvailable] = await Promise.all([
    listOrgProjects(orgId),
    listAdStudioBriefs(orgId, projectId),
    getAdStudioSettings(orgId, projectId),
    getAdStudioUsageToday(orgId, projectId),
    listAdStudioUsage(orgId, projectId, 25),
    getAdStudioKeywordDataStatus(orgId, projectId),
    isFfmpegAvailable(),
  ]);
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) notFound();

  const t = await getTranslations('AdStudio');
  const briefs = briefModels.map(toAdStudioBriefView);
  const selected = selectedBriefId ? briefs.find((brief) => brief.id === selectedBriefId) : undefined;
  if (selectedBriefId && !selected) notFound();
  const overview = summarizeAdStudio(briefs);
  const providers = describeAdStudioProviders();
  const base = `/orgs/${orgId}/projects/${projectId}/ad-studio`;
  const videoAvailable = resolveAdStudioOmni() !== null;
  const storage = resolveAdStudioMediaStorage().describe();

  // The selected ad's clips and assembled videos, and how far its video stage has come.
  const [clipModels, videoModels, exportRows, exportDestinations] = selected
    ? await Promise.all([
        listAdStudioClips(orgId, projectId, selected.id),
        listAdStudioVideos(orgId, projectId, selected.id),
        listAdStudioExports(orgId, projectId, selected.id),
        resolveAdStudioExportDestinations(orgId, projectId),
      ])
    : [[], [], [], null];
  const exportsView = exportRows.map(toAdStudioExportView);
  const uploadedCount = exportsView.filter((row) => row.status === 'done').length;
  const clips = clipModels.map(toAdStudioClipView);
  const videos = videoModels.map(toAdStudioVideoView);
  let videoStage: (AdStudioVideoStageProgress & { assembledSeconds: number | null }) | undefined;
  let exportableVideo: { id: string; durationSeconds: number } | null = null;
  if (selected) {
    const context = { format: selected.format, language: selected.language };
    const progress = summarizeVideoProgress(sceneVideoStates(selected.scenes, clips, context), selected.scenes);
    const assembly = assemblyPlan(selected.scenes, clips, context);
    const assembled = currentAssembledVideo(videos, assembly?.map((entry) => entry.clip.id) ?? null);
    videoStage = {
      rendered: progress.rendered,
      scenes: progress.scenes,
      assembled: assembled.current,
      assembledSeconds: assembled.current ? (assembled.latest?.durationSeconds ?? null) : null,
    };
    // Only the current assembled video is offered for export - never one made from out-of-date clips.
    if (assembled.current && assembled.latest) exportableVideo = { id: assembled.latest.id, durationSeconds: assembled.latest.durationSeconds };
  }

  const stageNodes: FlowNodeSpec[] = selected
    ? adStudioStages(selected, videoStage, uploadedCount > 0).map((stage) => ({
        id: stage.id,
        label: t(`stage.${stage.id}`),
        sublabel: t(`stageStatus.${stage.status}`),
        value:
          stage.id === 'script' && selected.scenes.length > 0
            ? t('stageScriptValue', { scenes: selected.scenes.length, seconds: totalSceneSeconds(selected.scenes) })
            : stage.id === 'plan' && selected.plan
              ? t('stagePlanValue', { count: selected.plan.recommendations.length })
              : stage.id === 'brief'
                ? t(selected.format === 'vertical' ? 'formatVerticalShort' : 'formatHorizontalShort')
                : stage.id === 'video' && videoStage && selected.scenes.length > 0
                  ? videoStage.assembled
                    ? t('stageVideoAssembled', { seconds: Math.round((videoStage.assembledSeconds ?? 0) * 10) / 10 })
                    : t('stageVideoValue', { rendered: videoStage.rendered, total: videoStage.scenes })
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

  return (
    <div className="container mx-auto flex max-w-6xl flex-col gap-6 py-8">
      <PageHero icon={Clapperboard} eyebrow={t('eyebrow')} title={t('title', { project: project.name })} description={t('description')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title={t('kpiAds')} value={overview.briefs} icon={FileText} />
          <StatCard title={t('kpiScripted')} value={overview.scripted} icon={Film} subtext={t('kpiScriptedHint', { seconds: overview.scriptedSeconds })} />
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
        </div>
      </PageHero>

      {!providers.text ? (
        <p className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          {t('providerNotConfigured')}
        </p>
      ) : null}

      {selected ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Link href={base} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                {t('backToAds')}
              </Link>
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <p className="max-w-3xl text-sm text-muted-foreground">{selected.objective}</p>
            </div>
            <DeleteBriefButton orgId={orgId} projectId={projectId} briefId={selected.id} afterDeleteHref={base} />
          </div>

          <ChartCard title={t('pipelineTitle')} description={t('pipelineDescription')} icon={Workflow}>
            <FlowDiagram label={t('pipelineTitle')} nodes={stageNodes} edges={stageEdges} height={200} />
          </ChartCard>

          <PlanningPanel
            orgId={orgId}
            projectId={projectId}
            briefId={selected.id}
            plan={selected.plan}
            sources={selected.planSources}
            generatedBy={selected.planGeneratedBy}
            aiAvailable={providers.text !== null}
          />

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <ScriptEditor
              orgId={orgId}
              projectId={projectId}
              briefId={selected.id}
              initialScenes={selected.scenes}
              generatedByModel={selected.scriptGeneratedBy?.model ?? null}
              aiAvailable={providers.text !== null}
            />
          </div>

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
              videoSecondsLeft={Math.max(0, settings.dailyVideoSeconds - usageToday.videoSeconds)}
            />
          </div>

          {exportDestinations ? (
            <ExportPanel
              orgId={orgId}
              projectId={projectId}
              briefId={selected.id}
              video={exportableVideo}
              destinations={{
                meta: exportDestinations.meta.available
                  ? { available: true, credentialName: exportDestinations.meta.credentialName }
                  : { available: false, reason: exportDestinations.meta.reason },
                youtube: exportDestinations.youtube.available
                  ? { available: true, credentialName: exportDestinations.youtube.credentialName }
                  : { available: false, reason: exportDestinations.youtube.reason },
              }}
              exports={exportsView}
              canExport={canExport}
              defaultTitle={selected.name}
              defaultDescription={selected.objective}
              resourcesHref={`/orgs/${orgId}/projects/${projectId}/resources`}
            />
          ) : null}

          <details className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold">{t('editDetails')}</summary>
            <div className="mt-4">
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
            </div>
          </details>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <ChartCard title={t('newAdTitle')} description={t('newAdDescription')} icon={Plus}>
            <BriefForm orgId={orgId} projectId={projectId} studioHref={base} />
          </ChartCard>

          <section className="flex flex-col gap-3" aria-labelledby="ad-studio-ads-heading">
            <h2 id="ad-studio-ads-heading" className="text-lg font-semibold">
              {t('adsListTitle')}
            </h2>
            {briefs.length === 0 ? (
              <EmptyState icon={Clapperboard} title={t('adsListEmptyTitle')} description={t('adsListEmpty')} />
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
                          <p className="line-clamp-2 text-xs text-muted-foreground">{brief.objective}</p>
                        </div>
                        <span className="flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {t(brief.format === 'vertical' ? 'formatVerticalShort' : 'formatHorizontalShort')}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-medium',
                              brief.scenes.length > 0 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
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

      <AdStudioAdminPanel
        orgId={orgId}
        projectId={projectId}
        canConfigure={canConfigure}
        textModel={providers.text}
        videoConfigured={providers.videoConfigured}
        keywordData={keywordData}
        storage={storage}
        ffmpegAvailable={ffmpegAvailable}
        limits={{ dailyTextGenerations: settings.dailyTextGenerations, dailyVideoSeconds: settings.dailyVideoSeconds }}
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
    </div>
  );
}
