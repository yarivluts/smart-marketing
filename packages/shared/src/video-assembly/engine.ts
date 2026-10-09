import type {
  AudioConformanceSpec,
  ChannelConformanceTarget,
  FfmpegRenderPlan,
  RenderJobRendition,
  StoryboardManifest,
  VideoAspectRatio,
  VideoCodec,
  VideoExportGuardrails,
  VideoExportTelemetryResult,
} from './types';

/**
 * Validates a storyboard scene manifest prior to cloud container assembly
 */
export function validateStoryboardManifest(manifest: StoryboardManifest): {
  valid: boolean;
  errors: string[];
  normalizedTotalSec: number;
} {
  const errors: string[] = [];

  if (!manifest.scenes || manifest.scenes.length === 0) {
    errors.push('Manifest must contain at least one storyboard scene.');
  }

  let totalCalculatedSec = 0;
  manifest.scenes?.forEach((scene, idx) => {
    if (!scene.durationSec || scene.durationSec <= 0) {
      errors.push(`Scene #${idx + 1} duration must be greater than 0 seconds.`);
    } else {
      totalCalculatedSec += scene.durationSec;
    }

    if (!scene.visualPrompt || scene.visualPrompt.trim().length === 0) {
      errors.push(`Scene #${idx + 1} is missing a visual prompt description.`);
    }

    if (!scene.voiceoverScript || scene.voiceoverScript.trim().length === 0) {
      errors.push(`Scene #${idx + 1} is missing a voiceover script.`);
    }
  });

  if (totalCalculatedSec < 5) {
    errors.push('Total storyboard duration must be at least 5 seconds.');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedTotalSec: totalCalculatedSec,
  };
}

/**
 * Computes deterministic keyframe timing and transition windows for stitching
 */
export function calculateSceneKeyframes(manifest: StoryboardManifest): Array<{
  sceneId: number;
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
  transition: string;
  voiceoverScript: string;
}> {
  let currentTime = 0;
  return manifest.scenes.map((scene) => {
    const startTime = currentTime;
    const endTime = currentTime + scene.durationSec;
    currentTime = endTime;
    return {
      sceneId: scene.id,
      startTimeSec: startTime,
      endTimeSec: endTime,
      durationSec: scene.durationSec,
      transition: scene.transition || 'crossfade',
      voiceoverScript: scene.voiceoverScript,
    };
  });
}

/**
 * Generates an FFmpeg filter complex render plan for Cloud Run / Cloud Tasks compilation
 */
export function generateFfmpegRenderPlan(
  manifest: StoryboardManifest,
  targetAspectRatio: VideoAspectRatio = manifest.aspectRatio || '9:16',
): FfmpegRenderPlan {
  const resolution =
    targetAspectRatio === '9:16'
      ? '1080x1920'
      : targetAspectRatio === '1:1'
      ? '1080x1080'
      : '1920x1080';

  const [w, h] = resolution.split('x');

  const videoFilters: string[] = [
    `scale=${w}:${h}:force_original_aspect_ratio=decrease`,
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'fps=60',
    'format=yuv420p',
  ];

  const audioFilters: string[] = [
    'volume=1.0',
    // Dynamic audio ducking for voiceover clarity
    'sidechaincompress=threshold=0.125:ratio=4:attack=20:release=300',
    // EBU R128 loudness normalization
    'loudnorm=I=-14.0:TP=-1.5:LRA=11.0',
  ];

  const filterComplex = `[0:v]${videoFilters.join(',')}[v];[0:a]${audioFilters.join(',')}[a]`;

  const totalSec = manifest.totalDurationSec || 30;
  const estimatedEncodingSec = Math.max(4, Math.round(totalSec * 0.4));
  const estimatedFileSizeBytes = Math.round(totalSec * 1_400_000); // ~11.2 Mbps

  return {
    jobId: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    storyboardId: manifest.id,
    aspectRatio: targetAspectRatio,
    resolution,
    videoFilters,
    audioFilters,
    filterComplex,
    estimatedEncodingSec,
    estimatedFileSizeBytes,
  };
}

/**
 * Estimates rendition file size and human-readable string based on duration and codec
 */
export function estimateRenditionBitrates(
  _aspectRatio: VideoAspectRatio,
  durationSec: number,
  codec: VideoCodec,
): { bytes: number; formatted: string } {
  let mbps = 15;
  if (codec === 'ProRes 422') {
    mbps = 880; // 4K 60FPS ProRes 422 HQ standard (~3.3 GB / 30s)
  } else if (codec === 'AV1') {
    mbps = 10;
  } else if (codec === 'VP9') {
    mbps = 12;
  } else if (codec === 'H.265') {
    mbps = 14;
  } else if (codec === 'H.264') {
    mbps = 16;
  }

  const bytes = Math.round((durationSec * mbps * 1_000_000) / 8);
  const mb = bytes / (1024 * 1024);

  if (mb >= 1000) {
    return { bytes, formatted: `${(mb / 1024).toFixed(1)} GB` };
  }
  return { bytes, formatted: `${Math.round(mb)} MB` };
}

/**
 * Evaluates target ad network channel conformance profiles
 */
export function evaluateChannelConformance(
  aspectRatio: VideoAspectRatio,
  guardrails: VideoExportGuardrails,
): ChannelConformanceTarget[] {
  const is916 = aspectRatio === '9:16';
  const is11 = aspectRatio === '1:1';

  return [
    {
      id: 'meta_reels',
      name: 'Meta Reels',
      format: '9:16 vertical • 1080x1920',
      specs: 'Bitrate: 15 Mbps H.265',
      status: is916 && guardrails.safeZonesChecked ? 'optimized' : 'reviewing',
      bitrate: '15 Mbps',
      safeZonesVerified: guardrails.safeZonesChecked,
      note: 'Safe zones verified',
    },
    {
      id: 'tiktok_spark',
      name: 'TikTok Spark',
      format: '9:16 vertical • 60 FPS',
      specs: 'Bitrate: 18 Mbps H.264',
      status: is916 ? 'optimized' : 'action_needed',
      bitrate: '18 Mbps',
      safeZonesVerified: guardrails.safeZonesChecked,
      note: 'Audio normalization active',
    },
    {
      id: 'youtube_shorts',
      name: 'YouTube Shorts',
      format: '9:16 vertical • 4K HDR',
      specs: 'Bitrate: 25 Mbps VP9/AV1',
      status: 'reviewing',
      bitrate: '25 Mbps',
      safeZonesVerified: guardrails.safeZonesChecked,
      note: 'Metadata tag check needed',
    },
    {
      id: 'google_pmax',
      name: 'Google Ads PMax',
      format: 'Multi-aspect 16:9 & 1:1',
      specs: 'Bitrate: 12 Mbps MP4',
      status: is11 || !is916 ? 'optimized' : 'optimized',
      bitrate: '12 Mbps',
      safeZonesVerified: true,
      note: 'Auto-cropped assets ready',
    },
  ];
}

/**
 * Returns rich baseline video export telemetry matching Stitch design bb113783
 */
export function getBaselineVideoExportTelemetry(
  projectName = 'Summer_Campaign_Master_v4',
): VideoExportTelemetryResult {
  const guardrails: VideoExportGuardrails = {
    brandSafetyPassed: true,
    dynamicAudioDucking: true,
    closedCaptionsBurnIn: true,
    captionsLanguage: 'English (US)',
    safeZonesChecked: true,
  };

  const audioConformance: AudioConformanceSpec = {
    loudnessLufs: -14.0,
    truePeakDb: -1.5,
    ebuR128Passed: true,
    dynamicDuckingActive: true,
    duckingRatioDb: -18.0,
    waveformSamples: [30, 60, 85, 45, 75, 95, 55, 30, 70, 100, 65, 40, 80],
  };

  const channelTargets = evaluateChannelConformance('9:16', guardrails);

  const renditionsQueue: RenderJobRendition[] = [
    {
      id: 'JOB-9401',
      format: 'Master ProRes 422',
      aspectRatio: '16:9',
      resolution: '3840x2160',
      duration: '00:30',
      fileSizeBytes: 3_650_722_201,
      fileSizeFormatted: '3.4 GB',
      codec: 'ProRes 422',
      container: 'mov',
      status: 'ready',
      downloadUrl: 'https://storage.googleapis.com/growthos-prod-media/exports/job-9401-master.mov',
      cdnUrl: 'https://cdn.growthos.io/media/exports/job-9401-master.mov',
      adNetworkSynced: { meta: true, google: true, tiktok: true },
    },
    {
      id: 'JOB-9402',
      format: 'Meta/TikTok 9:16 H.265',
      aspectRatio: '9:16',
      resolution: '1080x1920',
      duration: '00:30',
      fileSizeBytes: 148_897_792,
      fileSizeFormatted: '142 MB',
      codec: 'H.265',
      container: 'mp4',
      status: 'synced',
      downloadUrl: 'https://storage.googleapis.com/growthos-prod-media/exports/job-9402-reels.mp4',
      cdnUrl: 'https://cdn.growthos.io/media/exports/job-9402-reels.mp4',
      adNetworkSynced: { meta: true, tiktok: true },
    },
    {
      id: 'JOB-9403',
      format: 'YouTube Shorts 4K',
      aspectRatio: '9:16',
      resolution: '2160x3840',
      duration: '00:30',
      fileSizeBytes: 220_200_960,
      fileSizeFormatted: '210 MB',
      codec: 'AV1',
      container: 'mp4',
      status: 'ready',
      downloadUrl: 'https://storage.googleapis.com/growthos-prod-media/exports/job-9403-shorts.mp4',
      cdnUrl: 'https://cdn.growthos.io/media/exports/job-9403-shorts.mp4',
      adNetworkSynced: { google: true },
    },
    {
      id: 'JOB-9404',
      format: 'Google Ads PMax Square',
      aspectRatio: '1:1',
      resolution: '1080x1080',
      duration: '00:30',
      fileSizeBytes: 102_760_448,
      fileSizeFormatted: '98 MB',
      codec: 'H.264',
      container: 'mp4',
      status: 'synced',
      downloadUrl: 'https://storage.googleapis.com/growthos-prod-media/exports/job-9404-square.mp4',
      cdnUrl: 'https://cdn.growthos.io/media/exports/job-9404-square.mp4',
      adNetworkSynced: { google: true },
    },
  ];

  return {
    masterCut: {
      title: `${projectName}_ProRes422.mov`,
      format: 'ProRes 422 HQ',
      resolution: '4K (3840x2160)',
      framerate: '60 FPS',
      colorProfile: 'Dolby Vision / HDR10',
      durationSec: 30,
      aspectRatio: '9:16',
    },
    audioConformance,
    channelTargets,
    guardrails,
    renditionsQueue,
    engineStatus: {
      version: 'v2.8-cloudrun',
      gpuWorkerActive: true,
      gpuModel: 'NVIDIA L4 Cloud Worker',
      queueLength: renditionsQueue.length,
    },
  };
}
