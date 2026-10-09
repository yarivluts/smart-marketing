import { NextResponse, type NextRequest } from 'next/server';
import { VideoAssemblyService } from '@growthos/firebase-orm-models';
import type { StoryboardManifest, VideoAspectRatio } from '@growthos/shared';
import { requireOrgPermission } from '@/lib/orgs/access';

interface RouteParams {
  params: Promise<{ orgId: string; projectId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.read');
  if (error) {
    return error;
  }

  const { searchParams } = new URL(request.url);
  const projectName = searchParams.get('projectName') || 'Summer_Campaign_Master_v4';

  try {
    const telemetry = await VideoAssemblyService.getVideoExportTelemetry(orgId, projectId, projectName);
    return NextResponse.json({ ok: true, telemetry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to query video export telemetry';
    return NextResponse.json({ error: 'video_telemetry_query_failed', message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { orgId, projectId } = await params;
  const { error } = await requireOrgPermission(orgId, 'dashboards.write');
  if (error) {
    return error;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'render';

    if (action === 'dispatch') {
      const network = body.network || 'meta';
      const jobId = body.jobId || 'JOB-9402';
      const updatedJob = await VideoAssemblyService.dispatchRenditionToAdNetwork(
        orgId,
        projectId,
        jobId,
        network,
      );

      return NextResponse.json({
        ok: true,
        action: 'dispatch',
        job: updatedJob,
        message: `Asset ${jobId} successfully dispatched and verified in ${network === 'meta' ? 'Meta Creative Vault' : network === 'google' ? 'Google Ads Asset Vault' : 'TikTok Spark Vault'}.`,
      });
    }

    // Default action: 'render'
    const targetAspectRatio: VideoAspectRatio = body.aspectRatio || '9:16';
    const manifest: StoryboardManifest = body.manifest || {
      id: `sb_${Date.now()}`,
      title: body.title || 'Campaign Video Master Cut',
      aspectRatio: targetAspectRatio,
      totalDurationSec: body.durationSec || 30,
      audioTrack: body.audioTrack || 'energetic_synth',
      voiceActor: body.voiceActor || 'rachel',
      scenes: body.scenes || [
        {
          id: 1,
          durationSec: 6,
          visualPrompt: 'Dynamic 3D cinematic zoom on growth charts',
          voiceoverScript: 'Cut your CAC payback down with autonomous telemetry.',
          transition: 'fade',
        },
        {
          id: 2,
          durationSec: 12,
          visualPrompt: 'Real-time multi-touch attribution matrix with Markov chain weights',
          voiceoverScript: 'Stop guessing which ad drove the lead. Let game theory allocate spend.',
          transition: 'crossfade',
        },
        {
          id: 3,
          durationSec: 12,
          visualPrompt: '3.4x ROAS beat counter glowing mint green',
          voiceoverScript: 'Connect your ad accounts to GrowthOS today.',
          transition: 'dissolve',
        },
      ],
    };

    const newJob = await VideoAssemblyService.createVideoRenderJob(
      orgId,
      projectId,
      manifest,
      targetAspectRatio,
    );

    // Simulate / execute async compilation progression to Cloud Storage
    const processedJob = await VideoAssemblyService.processVideoRenderProgress(
      orgId,
      projectId,
      newJob.id,
    );

    return NextResponse.json({
      ok: true,
      action: 'render',
      job: processedJob,
      message: `Render job ${processedJob.id} compiled and stitched successfully to Cloud Storage.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to execute video assembly job';
    return NextResponse.json({ error: 'video_assembly_failed', message }, { status: 500 });
  }
}
