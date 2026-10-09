/**
 * Video Assembly & Container Cloud Stitching Types
 * Ad Studio Video Export Pipeline (KAN-313 / Stitch bb113783)
 */

export type VideoAspectRatio = '9:16' | '1:1' | '16:9';

export type VideoResolution = '1080x1920' | '1080x1080' | '1920x1080' | '3840x2160';

export type VideoCodec = 'H.264' | 'H.265' | 'VP9' | 'AV1' | 'ProRes 422';

export type VideoContainer = 'mp4' | 'mov' | 'webm';

export type VideoTransitionType = 'fade' | 'crossfade' | 'wipe' | 'dissolve' | 'zoom';

export interface StoryboardSceneItem {
  id: number;
  titleKey?: string;
  title?: string;
  durationSec: number;
  visualPrompt: string;
  voiceoverScript: string;
  transition?: VideoTransitionType;
  textOverlay?: string;
}

export interface StoryboardManifest {
  id: string;
  title: string;
  scenes: StoryboardSceneItem[];
  totalDurationSec: number;
  aspectRatio: VideoAspectRatio;
  audioTrack: string;
  voiceActor: string;
  targetLoudnessLufs?: number; // EBU R128 standard: -14 LUFS
}

export type RenderJobStatus =
  | 'queued'
  | 'stitching_scenes'
  | 'rendering_motion'
  | 'audio_ducking'
  | 'encoding_mp4'
  | 'uploading'
  | 'completed'
  | 'failed';

export interface RenderJobRendition {
  id: string;
  format: string;
  aspectRatio: VideoAspectRatio;
  resolution: string;
  duration: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  codec: VideoCodec;
  container: VideoContainer;
  status: 'ready' | 'synced' | 'rendering';
  downloadUrl: string;
  cdnUrl: string;
  adNetworkSynced?: {
    meta?: boolean;
    google?: boolean;
    tiktok?: boolean;
  };
}

export interface AudioConformanceSpec {
  loudnessLufs: number;
  truePeakDb: number;
  ebuR128Passed: boolean;
  dynamicDuckingActive: boolean;
  duckingRatioDb: number;
  waveformSamples: number[];
}

export interface ChannelConformanceTarget {
  id: 'meta_reels' | 'tiktok_spark' | 'youtube_shorts' | 'google_pmax';
  name: string;
  format: string;
  specs: string;
  status: 'optimized' | 'reviewing' | 'action_needed';
  bitrate: string;
  safeZonesVerified: boolean;
  note: string;
}

export interface VideoExportGuardrails {
  brandSafetyPassed: boolean;
  dynamicAudioDucking: boolean;
  closedCaptionsBurnIn: boolean;
  captionsLanguage: string;
  safeZonesChecked: boolean;
}

export interface VideoExportTelemetryResult {
  masterCut: {
    title: string;
    format: string;
    resolution: string;
    framerate: string;
    colorProfile: string;
    durationSec: number;
    aspectRatio: VideoAspectRatio;
  };
  audioConformance: AudioConformanceSpec;
  channelTargets: ChannelConformanceTarget[];
  guardrails: VideoExportGuardrails;
  renditionsQueue: RenderJobRendition[];
  engineStatus: {
    version: string;
    gpuWorkerActive: boolean;
    gpuModel: string;
    queueLength: number;
  };
}

export interface FfmpegRenderPlan {
  jobId: string;
  storyboardId: string;
  aspectRatio: VideoAspectRatio;
  resolution: string;
  videoFilters: string[];
  audioFilters: string[];
  filterComplex: string;
  estimatedEncodingSec: number;
  estimatedFileSizeBytes: number;
}
