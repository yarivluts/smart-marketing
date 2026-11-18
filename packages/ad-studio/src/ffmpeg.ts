import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { AD_STUDIO_MAX_TOTAL_SECONDS, type AdStudioFormat } from '@growthos/shared';

/**
 * Joins scene clips into the finished ad with ffmpeg (KAN-231). The binary comes from FFMPEG_PATH
 * (default `ffmpeg`, installed in the web runtime image).
 *
 * Every clip is re-encoded rather than stream-copied: clips from the same model usually match, but
 * a concat-copy silently breaks on any difference in resolution, frame rate, timebase or audio
 * layout, and an edit may come back in a different shape. So each input is trimmed and tail-locked
 * to its scene's scripted length (`tpad=stop_mode=clone` so 1-3 missing tail frames never jump),
 * scaled to cover one frame size (cropped, never letterboxed), set to one frame rate and uniform
 * `1/fps` timebase, and given a stereo 48 kHz track (silence when a clip has no audio) before
 * joining consecutive clips with a fast `0.25s` crossfade (`xfade=transition=fade` + `acrossfade`);
 * the output is H.264 + AAC with the index at the front for streaming, capped at 60 seconds.
 *
 * The only thing drawn onto the video is the brand strip (logo, name, slogan) every ad carries, laid
 * over every frame from a PNG; scene text is not: see the on-screen text decision in
 * `@growthos/shared`'s `ad-studio/video.ts`.
 */

export const AD_STUDIO_FRAME: Record<AdStudioFormat, { width: number; height: number }> = {
  vertical: { width: 720, height: 1280 },
  horizontal: { width: 1280, height: 720 },
};
/** The 1080p frame, for ads whose clips are made at 1080p; every other resolution is joined at 720p. */
export const AD_STUDIO_FRAME_1080P: Record<AdStudioFormat, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
};

/** The frame an ad is assembled at for the resolution its clips were asked for. */
export function assemblyFrame(format: AdStudioFormat, resolution?: string | null): { width: number; height: number } {
  return resolution === '1080p' ? AD_STUDIO_FRAME_1080P[format] : AD_STUDIO_FRAME[format];
}
export const AD_STUDIO_FPS = 30;
/** Fast crossfade between consecutive clips during assembly (short enough to fit inside scene narration margins). */
export const AD_STUDIO_TRANSITION_SECONDS = 0.25;
const MIN_TRANSITION_SECONDS = 0.05;
const DEFAULT_TIMEOUT_MS = 240_000;
const STDERR_KEEP_BYTES = 64 * 1024;

/** Transition duration between two adjacent segments, clamped safely below short-clip lengths. */
export function transitionSecondsBetween(
  beforeSeconds: number,
  afterSeconds: number,
  requested = AD_STUDIO_TRANSITION_SECONDS,
): number {
  if (requested <= 0) return 0;
  const cap = Math.min(requested, beforeSeconds / 3, afterSeconds / 3);
  const rounded = Math.floor(cap * 1000 + 1e-9) / 1000;
  return rounded >= MIN_TRANSITION_SECONDS ? rounded : 0;
}

/** Expected joined duration across `inputs` after accounting for overlapping crossfades. */
export function plannedConcatSeconds(
  inputs: readonly Pick<ConcatInput, 'seconds'>[],
  transitionSeconds = AD_STUDIO_TRANSITION_SECONDS,
): number {
  if (inputs.length === 0) return 0;
  let total = inputs[0].seconds;
  for (let i = 1; i < inputs.length; i += 1) {
    const fade = transitionSecondsBetween(total, inputs[i].seconds, transitionSeconds);
    total = total + inputs[i].seconds - fade;
  }
  return Math.round(total * 1000) / 1000;
}

export class FfmpegUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FfmpegUnavailableError';
  }
}

export class FfmpegFailedError extends Error {
  constructor(
    message: string,
    public readonly stderrTail: string,
  ) {
    super(message);
    this.name = 'FfmpegFailedError';
  }
}

export interface ConcatInput {
  file: string;
  /** How long this clip runs in the ad - its scene's length, or less if the clip is shorter. */
  seconds: number;
  hasAudio: boolean;
  /** Where in the file the clip starts (a moment of a product walkthrough); default 0. */
  startSeconds?: number;
  /**
   * How the picture fills the frame. `cover` (default): scaled until it fills the whole frame and the
   * overflow cropped from the centre, so a clip of a slightly different shape never shows black bars.
   * `pad`: scaled to fit, black bars. `screen`: a screen recording shown inside the frame on a
   * blurred, darkened copy of itself, in either orientation.
   */
  fit?: 'cover' | 'pad' | 'screen';
}

/** The share of the frame a `screen` clip's picture takes, so the blurred backdrop shows around it. */
const SCREEN_INSET = 0.92;

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/** The video filter chain for one input, ending in `[v<index>]`. */
export function clipVideoFilter(input: ConcatInput, index: number, frame: { width: number; height: number }, fps: number): string {
  const { width, height } = frame;
  const duration = seconds(input.seconds);
  const trim = input.startSeconds ? `trim=start=${seconds(input.startSeconds)}:duration=${duration}` : `trim=duration=${duration}`;
  // Pad with the final frame and re-trim to `duration` so a clip whose stream ends slightly short never jumps on xfade.
  const tail = `tpad=stop_mode=clone:stop_duration=${seconds(AD_STUDIO_TRANSITION_SECONDS)},trim=duration=${duration},setpts=PTS-STARTPTS,format=yuv420p,settb=1/${fps}[v${index}]`;
  if (input.fit === 'screen') {
    const innerWidth = even(width * SCREEN_INSET);
    const innerHeight = even(height * SCREEN_INSET);
    return [
      `[${index}:v:0]${trim},setpts=PTS-STARTPTS,fps=${fps},split=2[bgsrc${index}][fgsrc${index}]`,
      `[bgsrc${index}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=24:2,eq=brightness=-0.22[bg${index}]`,
      `[fgsrc${index}]scale=${innerWidth}:${innerHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg${index}]`,
      `[bg${index}][fg${index}]overlay=(W-w)/2:(H-h)/2,setsar=1,${tail}`,
    ].join(';');
  }
  if (input.fit === 'pad') {
    return `[${index}:v:0]${trim},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},${tail}`;
  }
  // Edge to edge: the frame is always filled, whatever shape the model returned.
  return `[${index}:v:0]${trim},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},${tail}`;
}

function seconds(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** The full ffmpeg argument list for joining `inputs` in order into `output`. */
export function buildConcatArgs(params: {
  inputs: readonly ConcatInput[];
  output: string;
  format: AdStudioFormat;
  resolution?: string | null;
  fps?: number;
  maxSeconds?: number;
  transitionSeconds?: number;
  /** A PNG the size of the frame (the brand strip on transparency), laid over every frame. */
  overlay?: string | null;
}): string[] {
  const { inputs, output, format } = params;
  if (inputs.length === 0) throw new Error('Nothing to join.');
  const fps = params.fps ?? AD_STUDIO_FPS;
  const { width, height } = assemblyFrame(format, params.resolution);
  const args = ['-hide_banner', '-nostdin', '-y'];
  for (const input of inputs) args.push('-i', input.file);

  // Silent tracks for clips without audio are extra inputs after the clips.
  const audioSource = new Map<number, number>();
  let next = inputs.length;
  inputs.forEach((input, index) => {
    if (input.hasAudio) {
      audioSource.set(index, index);
    } else {
      args.push('-f', 'lavfi', '-t', seconds(input.seconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
      audioSource.set(index, next);
      next += 1;
    }
  });

  const filters: string[] = [];
  inputs.forEach((input, index) => {
    const duration = seconds(input.seconds);
    // A clip's own sound starts where its picture does; a silent track starts at zero.
    const audioTrim = input.hasAudio && input.startSeconds ? `atrim=start=${seconds(input.startSeconds)}:duration=${duration}` : `atrim=duration=${duration}`;
    filters.push(
      clipVideoFilter(input, index, { width, height }, fps),
      `[${audioSource.get(index)}:a:0]${audioTrim},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS[a${index}]`,
    );
  });

  const requestedTransition = params.transitionSeconds ?? AD_STUDIO_TRANSITION_SECONDS;
  const finalVideoLabel = params.overlay ? '[vjoined]' : '[vout]';
  if (inputs.length === 1) {
    filters.push(`[v0][a0]concat=n=1:v=1:a=1${finalVideoLabel}[aout]`);
  } else {
    let currentVideo = '[v0]';
    let currentAudio = '[a0]';
    let timeline = inputs[0].seconds;
    for (let i = 1; i < inputs.length; i += 1) {
      const isLast = i === inputs.length - 1;
      const vNext = isLast ? finalVideoLabel : `[vx${i}]`;
      const aNext = isLast ? '[aout]' : `[ax${i}]`;
      const fade = transitionSecondsBetween(timeline, inputs[i].seconds, requestedTransition);
      if (fade > 0) {
        const offset = Math.max(0, timeline - fade);
        filters.push(`${currentVideo}[v${i}]xfade=transition=fade:duration=${seconds(fade)}:offset=${seconds(offset)}${vNext}`);
        filters.push(`${currentAudio}[a${i}]acrossfade=d=${seconds(fade)}:c1=tri:c2=tri${aNext}`);
        timeline = timeline + inputs[i].seconds - fade;
      } else {
        filters.push(`${currentVideo}${currentAudio}[v${i}][a${i}]concat=n=2:v=1:a=1${vNext}${aNext}`);
        timeline += inputs[i].seconds;
      }
      currentVideo = vNext;
      currentAudio = aNext;
    }
  }
  if (params.overlay) {
    // One still image after every other input; overlay repeats its only frame for the whole ad.
    args.push('-i', params.overlay);
    filters.push(`[${next}:v:0]scale=${width}:${height},format=rgba[brand]`, `[vjoined][brand]overlay=0:0:format=auto,format=yuv420p[vout]`);
  }

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    // High profile at level 4.0 plays everywhere: every browser, iOS Safari and the ad platforms.
    '-profile:v',
    'high',
    '-level:v',
    '4.0',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-t',
    seconds(params.maxSeconds ?? AD_STUDIO_MAX_TOTAL_SECONDS),
    output,
  );
  return args;
}

/** What `ffmpeg -i file` reports about an input: its length and whether it has picture and sound. */
export function parseProbeOutput(stderr: string): { durationSeconds: number | null; hasVideo: boolean; hasAudio: boolean } {
  const duration = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  return {
    durationSeconds: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null,
    hasVideo: /Stream #\d+:\d+.*?: Video:/.test(stderr),
    hasAudio: /Stream #\d+:\d+.*?: Audio:/.test(stderr),
  };
}

/** The last `time=` progress mark ffmpeg printed - how long the written output runs. */
export function parseEncodedSeconds(stderr: string): number | null {
  const marks = [...stderr.matchAll(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
  const last = marks.at(-1);
  return last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : null;
}

export interface SpawnedProcess {
  stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}

export type SpawnLike = (command: string, args: string[], options: { stdio: ['ignore', 'ignore', 'pipe']; windowsHide: boolean }) => SpawnedProcess;

export interface FfmpegRunner {
  ffmpegPath: string;
  spawnImpl: SpawnLike;
  timeoutMs: number;
}

export function defaultFfmpegRunner(env: NodeJS.ProcessEnv = process.env): FfmpegRunner {
  return { ffmpegPath: env.FFMPEG_PATH?.trim() || 'ffmpeg', spawnImpl: spawn as unknown as SpawnLike, timeoutMs: DEFAULT_TIMEOUT_MS };
}

/** Runs ffmpeg and resolves with its exit code and the tail of its log; a missing binary rejects. */
export function runFfmpeg(args: string[], runner: FfmpegRunner): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    let settled = false;
    let child: SpawnedProcess;
    try {
      child = runner.spawnImpl(runner.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    } catch (error) {
      reject(new FfmpegUnavailableError(error instanceof Error ? error.message : String(error)));
      return;
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new FfmpegFailedError('ffmpeg took too long.', stderr.slice(-2000)));
    }, runner.timeoutMs);
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-STDERR_KEEP_BYTES);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject((error as NodeJS.ErrnoException).code === 'ENOENT' ? new FfmpegUnavailableError(`ffmpeg was not found at "${runner.ffmpegPath}".`) : error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

export async function probeMedia(file: string, runner: FfmpegRunner): Promise<ReturnType<typeof parseProbeOutput>> {
  // With no output ffmpeg exits non-zero after printing the input's streams - that listing is all we need.
  const { stderr } = await runFfmpeg(['-hide_banner', '-nostdin', '-i', file], runner);
  return parseProbeOutput(stderr);
}

/**
 * Joins clips (already on local disk) in order into `output`. Each clip runs its scene's length, or
 * its own length if shorter; a file with no video stream is refused. Returns the output's length.
 */
export async function concatClips(params: {
  clips: readonly { file: string; seconds: number; startSeconds?: number; fit?: ConcatInput['fit'] }[];
  output: string;
  format: AdStudioFormat;
  resolution?: string | null;
  overlay?: string | null;
  runner: FfmpegRunner;
}): Promise<{ durationSeconds: number }> {
  const inputs: ConcatInput[] = [];
  for (const clip of params.clips) {
    const probe = await probeMedia(clip.file, params.runner);
    if (!probe.hasVideo) throw new FfmpegFailedError('A clip has no video stream.', '');
    const start = clip.startSeconds ?? 0;
    const available = probe.durationSeconds ? Math.max(0, probe.durationSeconds - start) : null;
    inputs.push({
      file: clip.file,
      seconds: available !== null ? Math.min(clip.seconds, available) : clip.seconds,
      hasAudio: probe.hasAudio,
      ...(start ? { startSeconds: start } : {}),
      ...(clip.fit ? { fit: clip.fit } : {}),
    });
  }
  const { code, stderr } = await runFfmpeg(buildConcatArgs({ inputs, output: params.output, format: params.format, resolution: params.resolution, overlay: params.overlay }), params.runner);
  if (code !== 0) throw new FfmpegFailedError(`ffmpeg exited with code ${code}.`, stderr.slice(-2000));
  // The container's own length is the most accurate; the last progress mark trails it slightly.
  const planned = plannedConcatSeconds(inputs);
  const measured = (await probeMedia(params.output, params.runner).catch(() => null))?.durationSeconds ?? parseEncodedSeconds(stderr) ?? planned;
  return { durationSeconds: Math.round(Math.min(measured, AD_STUDIO_MAX_TOTAL_SECONDS) * 100) / 100 };
}

/**
 * How a voice-over is laid onto its clip: the narration starts just after the cut and is the clip's
 * only sound - the video model's own audio track is discarded, not ducked, because even when told to
 * stay silent it sometimes put voices in it (prod, 2026-11) - over a silent bed, so every narrated
 * clip carries an AAC track of exactly the clip's length. The clip keeps its length. A line
 * longer than the room it has is sped up a little (at most 25%, which still sounds natural) and, if
 * it still does not fit, cut with a short fade rather than running past the scene.
 */
export const NARRATION_START_SECONDS = 0.2;
/** Silence left after the narration before the next scene's cut. */
export const NARRATION_TAIL_SECONDS = 0.15;
export const NARRATION_MAX_TEMPO = 1.25;
export const NARRATION_FADE_SECONDS = 0.3;
const NARRATION_MIX_TIMEOUT_MS = 60_000;

export interface NarrationFit {
  /** atempo factor, 1 when the line fits as spoken. */
  tempo: number;
  /** How long the narration runs once placed (after tempo and any cut). */
  seconds: number;
  /** True when even sped up it is longer than the room it has, so it is cut with a fade. */
  trimmed: boolean;
}

/** How a line of `narrationSeconds` fits a clip of `clipSeconds` (see NARRATION_*). */
export function fitNarration(clipSeconds: number, narrationSeconds: number): NarrationFit {
  const room = Math.max(0.5, clipSeconds - NARRATION_START_SECONDS - NARRATION_TAIL_SECONDS);
  if (narrationSeconds <= room) return { tempo: 1, seconds: narrationSeconds, trimmed: false };
  const tempo = Math.min(narrationSeconds / room, NARRATION_MAX_TEMPO);
  const spoken = narrationSeconds / tempo;
  return spoken <= room + 0.001 ? { tempo, seconds: spoken, trimmed: false } : { tempo, seconds: room, trimmed: true };
}

/**
 * The ffmpeg arguments that lay `narration` (a WAV) onto `video` as its only sound, keeping the
 * clip's length. Only the clip's picture is mapped; its audio track, if any, is never read.
 */
export function buildNarrationMixArgs(params: { video: string; narration: string; output: string; clipSeconds: number; narrationSeconds: number }): string[] {
  const { video, narration, output, clipSeconds } = params;
  const fit = fitNarration(clipSeconds, params.narrationSeconds);
  const start = NARRATION_START_SECONDS;
  // A silent bed the clip's length (input 2), so the soundtrack always runs the whole clip.
  const args = ['-hide_banner', '-nostdin', '-y', '-i', video, '-i', narration, '-f', 'lavfi', '-t', seconds(clipSeconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'];
  const narrationChain = [
    'aresample=48000',
    'aformat=sample_fmts=fltp:channel_layouts=stereo',
    ...(fit.tempo > 1 ? [`atempo=${fit.tempo.toFixed(4)}`] : []),
    ...(fit.trimmed ? [`atrim=duration=${seconds(fit.seconds)}`, `afade=t=out:st=${seconds(Math.max(0, fit.seconds - NARRATION_FADE_SECONDS))}:d=${seconds(NARRATION_FADE_SECONDS)}`] : []),
    'asetpts=PTS-STARTPTS',
    `adelay=${Math.round(start * 1000)}:all=1`,
  ].join(',');
  const filters = [
    `[1:a:0]${narrationChain}[narration]`,
    '[2:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad[bed]',
    `[bed][narration]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`,
  ];
  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-t',
    seconds(clipSeconds),
    output,
  );
  return args;
}

/**
 * Lays a voice-over (WAV) onto its speechless clip (MP4) and writes `output`, an MP4 of the clip's
 * length: H.264 + AAC, index at the front. Returns how the narration was fitted.
 */
export async function mixNarration(params: { video: string; narration: string; output: string; runner: FfmpegRunner }): Promise<NarrationFit & { clipSeconds: number }> {
  const clip = await probeMedia(params.video, params.runner);
  if (!clip.hasVideo || !clip.durationSeconds) throw new FfmpegFailedError('The clip has no video stream.', '');
  const voice = await probeMedia(params.narration, params.runner);
  if (!voice.hasAudio || !voice.durationSeconds) throw new FfmpegFailedError('The narration has no audio.', '');
  const args = buildNarrationMixArgs({ video: params.video, narration: params.narration, output: params.output, clipSeconds: clip.durationSeconds, narrationSeconds: voice.durationSeconds });
  // A 10-second clip mixes in seconds; a stuck run is stopped well inside the clip's 2-minute lease.
  const { code, stderr } = await runFfmpeg(args, { ...params.runner, timeoutMs: Math.min(params.runner.timeoutMs, NARRATION_MIX_TIMEOUT_MS) });
  if (code !== 0) throw new FfmpegFailedError(`ffmpeg exited with code ${code}.`, stderr.slice(-2000));
  return { ...fitNarration(clip.durationSeconds, voice.durationSeconds), clipSeconds: clip.durationSeconds };
}

let availability: { path: string; result: Promise<boolean> } | null = null;

/** Whether the configured ffmpeg runs, for the admin panel. Checked once per process. */
export function isFfmpegAvailable(runner: FfmpegRunner = defaultFfmpegRunner()): Promise<boolean> {
  if (availability?.path !== runner.ffmpegPath) {
    availability = {
      path: runner.ffmpegPath,
      result: runFfmpeg(['-hide_banner', '-version'], { ...runner, timeoutMs: 10_000 })
        .then(({ code }) => code === 0)
        .catch(() => false),
    };
  }
  return availability.result;
}

/**
 * Crops an image to an aspect ratio (centered) and scales it to `width`x`height` - for platform rules
 * such as Google's 1.91:1 marketing image and 1:1 square image. PNG in, PNG out.
 */
export function cropToAspectArgs(input: string, output: string, width: number, height: number): string[] {
  const ratio = (width / height).toFixed(4);
  const crop = `crop='if(gt(iw/ih,${ratio}),ih*${ratio},iw)':'if(gt(iw/ih,${ratio}),ih,iw/${ratio})'`;
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', `${crop},scale=${width}:${height}`, '-frames:v', '1', output];
}

/** One frame of a video (at `atSeconds`) as a JPEG - a video ad's thumbnail. */
export function videoFrameArgs(input: string, output: string, atSeconds: number): string[] {
  return ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(atSeconds), '-i', input, '-frames:v', '1', '-q:v', '3', output];
}

const MAX_SCROLL_SHEET_HEIGHT = 10_000;
const MIN_SCROLL_HEIGHT_MULTIPLIER = 1.18;
const MAX_SCROLL_SCREENS = 2.4;

/**
 * FFmpeg arguments that animate a tall full-page PNG into a smooth vertical scroll video with
 * cosine ease-in-out motion, brief top/bottom holds, and stereo 48 kHz silent audio.
 */
export function buildScrollVideoArgs(params: {
  image: string;
  output: string;
  sheetWidth: number;
  sheetHeight: number;
  frameWidth: number;
  frameHeight: number;
  durationSeconds: number;
  fps?: number;
}): string[] {
  const fps = params.fps ?? AD_STUDIO_FPS;
  const durNum = Math.max(1, params.durationSeconds);
  const dur = seconds(durNum);
  const cropW = even(params.sheetWidth);
  const cropH = even(Math.min(params.sheetHeight, Math.round((cropW * params.frameHeight) / params.frameWidth)));
  const maxTravel = Math.max(0, Math.min(params.sheetHeight - cropH, Math.round(cropH * MAX_SCROLL_SCREENS)));

  const holdStart = Math.round(Math.min(0.45, durNum * 0.12) * 1000) / 1000;
  const holdEnd = Math.round(Math.min(0.4, durNum * 0.12) * 1000) / 1000;
  const moveDur = Math.round(Math.max(0.4, durNum - holdStart - holdEnd) * 1000) / 1000;
  const endMove = Math.round((holdStart + moveDur) * 1000) / 1000;

  // Escaped commas keep the expression inside the filter graph option without shell quoting.
  const yExpr =
    maxTravel > 0
      ? `if(lt(t\\,${seconds(holdStart)})\\,0\\,if(gt(t\\,${seconds(endMove)})\\,${maxTravel}\\,${maxTravel}*(0.5-0.5*cos(PI*(t-${seconds(holdStart)})/${seconds(moveDur)}))))`
      : '0';

  const filter = `[0:v:0]crop=${cropW}:${cropH}:0:${yExpr},scale=${params.frameWidth}:${params.frameHeight}:flags=bilinear,setsar=1,fps=${fps},format=yuv420p[vout];[1:a:0]atrim=duration=${dur},asetpts=PTS-STARTPTS[aout]`;

  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loop',
    '1',
    '-framerate',
    String(fps),
    '-t',
    dur,
    '-i',
    params.image,
    '-f',
    'lavfi',
    '-t',
    dur,
    '-i',
    'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex',
    filter,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-level:v',
    '4.0',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-t',
    dur,
    params.output,
  ];
}

/**
 * Turns a full-page screenshot or uploaded page image into an MP4 showing a smooth vertical scroll,
 * ready to plug straight into `concatClips` with no AI video quota.
 */
export async function renderScrollingPageVideo(params: {
  imageBytes: Buffer;
  output: string;
  format: AdStudioFormat;
  resolution?: string | null;
  durationSeconds: number;
  runner?: FfmpegRunner;
}): Promise<{ durationSeconds: number }> {
  const runner = params.runner ?? defaultFfmpegRunner();
  const frame = assemblyFrame(params.format, params.resolution);
  const sheetWidth = even(frame.width * 2);
  const minHeight = even(Math.round(frame.height * 2 * MIN_SCROLL_HEIGHT_MULTIPLIER));

  const workDir = await mkdtemp(path.join(tmpdir(), 'ad-studio-scroll-'));
  try {
    const initial = sharp(params.imageBytes, { failOn: 'error' }).rotate();
    const scaledBuffer = await initial.resize({ width: sheetWidth }).png().toBuffer();
    const scaledMeta = await sharp(scaledBuffer).metadata();
    const scaledHeight = scaledMeta.height ?? minHeight;

    let finalSheetBuffer: Buffer;
    let finalHeight: number;
    if (scaledHeight < minHeight) {
      finalHeight = minHeight;
      finalSheetBuffer = await sharp(scaledBuffer)
        .resize({ width: sheetWidth, height: minHeight, fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
    } else if (scaledHeight > MAX_SCROLL_SHEET_HEIGHT) {
      finalHeight = MAX_SCROLL_SHEET_HEIGHT;
      finalSheetBuffer = await sharp(scaledBuffer)
        .extract({ left: 0, top: 0, width: sheetWidth, height: MAX_SCROLL_SHEET_HEIGHT })
        .png()
        .toBuffer();
    } else {
      finalHeight = even(scaledHeight);
      finalSheetBuffer =
        finalHeight === scaledHeight
          ? scaledBuffer
          : await sharp(scaledBuffer).extract({ left: 0, top: 0, width: sheetWidth, height: finalHeight }).png().toBuffer();
    }

    const sheetPath = path.join(workDir, 'sheet.png');
    await writeFile(sheetPath, finalSheetBuffer);

    const args = buildScrollVideoArgs({
      image: sheetPath,
      output: params.output,
      sheetWidth,
      sheetHeight: finalHeight,
      frameWidth: frame.width,
      frameHeight: frame.height,
      durationSeconds: params.durationSeconds,
    });
    const { code, stderr } = await runFfmpeg(args, runner);
    if (code !== 0) {
      throw new FfmpegFailedError(`ffmpeg exited with code ${code}.`, stderr.slice(-2000));
    }
    return { durationSeconds: params.durationSeconds };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
