import { describe, expect, it } from 'vitest';
import {
  calculateSceneKeyframes,
  estimateRenditionBitrates,
  evaluateChannelConformance,
  generateFfmpegRenderPlan,
  getBaselineVideoExportTelemetry,
  validateStoryboardManifest,
} from './engine';
import type { StoryboardManifest } from './types';

describe('Video Assembly Pure Domain Engine (KAN-313 / Stitch bb113783)', () => {
  const mockManifest: StoryboardManifest = {
    id: 'sb_test_101',
    title: 'Autumn Growth SaaS Demo',
    aspectRatio: '9:16',
    totalDurationSec: 30,
    audioTrack: 'energetic_synth',
    voiceActor: 'rachel',
    scenes: [
      {
        id: 1,
        durationSec: 5,
        visualPrompt: 'Cinematic 3D animation of marketer watching real-time CAC drop',
        voiceoverScript: 'What if your ad budget optimized itself in real time?',
        transition: 'fade',
      },
      {
        id: 2,
        durationSec: 10,
        visualPrompt: 'Split screen comparing legacy single-touch vs Shapley attribution',
        voiceoverScript: 'Stop guessing which ad drove the lead. Let game theory calculate true marginal ROI.',
        transition: 'crossfade',
      },
      {
        id: 3,
        durationSec: 15,
        visualPrompt: 'Executive command center showing 3.4x ROAS beat and instant payback',
        voiceoverScript: 'Connect your ad accounts to GrowthOS today.',
        transition: 'dissolve',
      },
    ],
  };

  it('validates storyboard manifest correctly', () => {
    const res = validateStoryboardManifest(mockManifest);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.normalizedTotalSec).toBe(30);

    const invalidRes = validateStoryboardManifest({
      ...mockManifest,
      scenes: [],
    });
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.errors).toContain('Manifest must contain at least one storyboard scene.');
  });

  it('calculates continuous scene keyframe windows and transitions', () => {
    const keyframes = calculateSceneKeyframes(mockManifest);
    expect(keyframes).toHaveLength(3);

    expect(keyframes[0].startTimeSec).toBe(0);
    expect(keyframes[0].endTimeSec).toBe(5);
    expect(keyframes[0].transition).toBe('fade');

    expect(keyframes[1].startTimeSec).toBe(5);
    expect(keyframes[1].endTimeSec).toBe(15);
    expect(keyframes[1].transition).toBe('crossfade');

    expect(keyframes[2].startTimeSec).toBe(15);
    expect(keyframes[2].endTimeSec).toBe(30);
    expect(keyframes[2].transition).toBe('dissolve');
  });

  it('generates deterministic FFmpeg render plan with video and EBU R128 audio filters', () => {
    const plan = generateFfmpegRenderPlan(mockManifest, '9:16');
    expect(plan.resolution).toBe('1080x1920');
    expect(plan.aspectRatio).toBe('9:16');
    expect(plan.filterComplex).toContain('scale=1080:1920');
    expect(plan.filterComplex).toContain('loudnorm=I=-14.0:TP=-1.5:LRA=11.0');
    expect(plan.filterComplex).toContain('sidechaincompress');
    expect(plan.estimatedEncodingSec).toBeGreaterThan(0);
    expect(plan.estimatedFileSizeBytes).toBeGreaterThan(0);
  });

  it('supports 1:1 and 16:9 aspect ratio target resolutions in render plan', () => {
    const planSquare = generateFfmpegRenderPlan(mockManifest, '1:1');
    expect(planSquare.resolution).toBe('1080x1080');
    expect(planSquare.filterComplex).toContain('scale=1080:1080');

    const planLandscape = generateFfmpegRenderPlan(mockManifest, '16:9');
    expect(planLandscape.resolution).toBe('1920x1080');
    expect(planLandscape.filterComplex).toContain('scale=1920:1080');
  });

  it('estimates rendition bitrates and file size formatting across codecs', () => {
    const proRes = estimateRenditionBitrates('16:9', 30, 'ProRes 422');
    expect(proRes.formatted).toContain('GB');

    const h265 = estimateRenditionBitrates('9:16', 30, 'H.265');
    expect(h265.formatted).toContain('MB');
  });

  it('evaluates channel conformance targets matching Stitch specs', () => {
    const targets = evaluateChannelConformance('9:16', {
      brandSafetyPassed: true,
      dynamicAudioDucking: true,
      closedCaptionsBurnIn: true,
      captionsLanguage: 'English (US)',
      safeZonesChecked: true,
    });

    expect(targets).toHaveLength(4);
    const meta = targets.find((t) => t.id === 'meta_reels');
    expect(meta?.status).toBe('optimized');
    expect(meta?.safeZonesVerified).toBe(true);

    const tiktok = targets.find((t) => t.id === 'tiktok_spark');
    expect(tiktok?.status).toBe('optimized');
  });

  it('produces calibrated baseline video export telemetry matching Stitch design bb113783', () => {
    const telemetry = getBaselineVideoExportTelemetry('Summer_Campaign_Master_v4');

    expect(telemetry.masterCut.title).toBe('Summer_Campaign_Master_v4_ProRes422.mov');
    expect(telemetry.masterCut.colorProfile).toContain('Dolby Vision');
    expect(telemetry.masterCut.framerate).toBe('60 FPS');

    expect(telemetry.audioConformance.ebuR128Passed).toBe(true);
    expect(telemetry.audioConformance.loudnessLufs).toBe(-14);
    expect(telemetry.audioConformance.waveformSamples.length).toBeGreaterThan(5);

    expect(telemetry.renditionsQueue).toHaveLength(4);
    expect(telemetry.renditionsQueue[0].format).toBe('Master ProRes 422');
    expect(telemetry.renditionsQueue[1].format).toBe('Meta/TikTok 9:16 H.265');
    expect(telemetry.renditionsQueue[2].format).toBe('YouTube Shorts 4K');
    expect(telemetry.renditionsQueue[3].format).toBe('Google Ads PMax Square');

    expect(telemetry.engineStatus.gpuWorkerActive).toBe(true);
  });
});
