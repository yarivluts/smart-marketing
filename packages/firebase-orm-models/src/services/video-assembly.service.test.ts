import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoAssemblyService } from './video-assembly.service';
import { VideoRenderJobModel } from '../models/video-render-job.model';
import type { StoryboardManifest } from '@growthos/shared';

vi.mock('../models/video-render-job.model', () => {
  const VideoRenderJobModelMock = vi.fn().mockImplementation(() => ({
    id: 'JOB-9999',
    organization_id: 'org-1',
    project_id: 'proj-1',
    storyboard_id: 'sb_test_202',
    title: 'High Intent Lead Gen Ad',
    format: 'Meta/TikTok 9:16 H.265',
    aspect_ratio: '9:16',
    resolution: '1080x1920',
    duration: '00:30',
    duration_sec: 30,
    file_size_formatted: '142 MB',
    file_size_bytes: 148897792,
    codec: 'H.265',
    container: 'mp4',
    status: 'queued',
    progress_pct: 0,
    download_url: 'https://storage.googleapis.com/growthos-prod-media/exports/job-9999.mp4',
    cdnUrl: 'https://cdn.growthos.io/media/exports/job-9999.mp4',
    ad_network_synced_meta: false,
    ad_network_synced_google: false,
    ad_network_synced_tiktok: false,
    setPathParams: vi.fn(),
    save: vi.fn().mockResolvedValue(true),
  }));
  (VideoRenderJobModelMock as any).initPath = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue([]),
    }),
  });
  (VideoRenderJobModelMock as any).init = vi.fn().mockResolvedValue(null);
  return { VideoRenderJobModel: VideoRenderJobModelMock };
});

describe('VideoAssemblyService (KAN-313 / Stitch bb113783)', () => {
  const mockManifest: StoryboardManifest = {
    id: 'sb_test_202',
    title: 'High Intent Lead Gen Ad',
    aspectRatio: '9:16',
    totalDurationSec: 30,
    audioTrack: 'energetic',
    voiceActor: 'rachel',
    scenes: [
      {
        id: 1,
        durationSec: 10,
        visualPrompt: 'Marketer analyzing attribution curves',
        voiceoverScript: 'Stop burning budget on unmeasured clicks.',
      },
      {
        id: 2,
        durationSec: 20,
        visualPrompt: 'GrowthOS executive dashboard with 3.4x ROAS beat',
        voiceoverScript: 'Automate channel allocations in real time.',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches video export telemetry with baseline and mapped renditions queue', async () => {
    const telemetry = await VideoAssemblyService.getVideoExportTelemetry('org-1', 'proj-1');

    expect(telemetry.masterCut).toBeDefined();
    expect(telemetry.masterCut.framerate).toBe('60 FPS');
    expect(telemetry.audioConformance.ebuR128Passed).toBe(true);
    expect(telemetry.audioConformance.loudnessLufs).toBe(-14);
    expect(telemetry.channelTargets).toHaveLength(4);
    expect(telemetry.renditionsQueue.length).toBeGreaterThanOrEqual(4);
  });

  it('creates and enqueues a video render job with validation and bitrate calculations', async () => {
    const job = await VideoAssemblyService.createVideoRenderJob(
      'org-1',
      'proj-1',
      mockManifest,
      '9:16',
    );

    expect(job.id).toBeDefined();
    expect(job.organization_id).toBe('org-1');
    expect(job.project_id).toBe('proj-1');
    expect(job.aspect_ratio).toBe('9:16');
    expect(job.resolution).toBe('1080x1920');
    expect(job.status).toBe('queued');
    expect(job.progress_pct).toBe(0);
    expect(job.download_url).toContain('.mp4');
  });

  it('throws error when creating job with invalid manifest', async () => {
    await expect(
      VideoAssemblyService.createVideoRenderJob('org-1', 'proj-1', {
        ...mockManifest,
        scenes: [],
      }),
    ).rejects.toThrow(/Invalid storyboard manifest/);
  });

  it('processes video render queue and completes compilation progress', async () => {
    const completedJob = await VideoAssemblyService.processVideoRenderProgress(
      'org-1',
      'proj-1',
      'JOB-9999',
    );

    expect(completedJob.id).toBe('JOB-9999');
    expect(completedJob.status).toBe('completed');
    expect(completedJob.progress_pct).toBe(100);
    expect(completedJob.completed_at).toBeDefined();
  });

  it('dispatches rendition to Ad Networks (Meta, Google, TikTok)', async () => {
    const metaDispatched = await VideoAssemblyService.dispatchRenditionToAdNetwork(
      'org-1',
      'proj-1',
      'JOB-8888',
      'meta',
    );
    expect(metaDispatched.ad_network_synced_meta).toBe(true);

    const googleDispatched = await VideoAssemblyService.dispatchRenditionToAdNetwork(
      'org-1',
      'proj-1',
      'JOB-8888',
      'google',
    );
    expect(googleDispatched.ad_network_synced_google).toBe(true);
  });
});
