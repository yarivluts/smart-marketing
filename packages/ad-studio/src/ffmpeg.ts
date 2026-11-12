import { spawn } from 'node:child_process';
import { AD_STUDIO_MAX_TOTAL_SECONDS, type AdStudioFormat } from '@growthos/shared';

/**
 * Joins scene clips into the finished ad with ffmpeg (KAN-231). The binary comes from FFMPEG_PATH
 * (default `ffmpeg`, installed in the web runtime image).
 *
 * Every clip is re-encoded rather than stream-copied: clips from the same model usually match, but
 * a concat-copy silently breaks on any difference in resolution, frame rate, timebase or audio
 * layout, and an edit may come back in a different shape. So each input is trimmed to its scene's
 * scripted length, scaled to cover one frame size (cropped, never letterboxed), set to one frame rate, and given a stereo
 * 48 kHz track (silence when a clip has no audio) before the concat filter; the output is H.264 +
 * AAC with the index at the front for streaming, capped at 60 seconds.
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
const DEFAULT_TIMEOUT_MS = 240_000;
const STDERR_KEEP_BYTES = 64 * 1024;

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
  const trim = input.startSeconds ? `trim=start=${seconds(input.startSeconds)}:duration=${seconds(input.seconds)}` : `trim=duration=${seconds(input.seconds)}`;
  if (input.fit === 'screen') {
    const innerWidth = even(width * SCREEN_INSET);
    const innerHeight = even(height * SCREEN_INSET);
    return [
      `[${index}:v:0]${trim},setpts=PTS-STARTPTS,fps=${fps},split=2[bgsrc${index}][fgsrc${index}]`,
      `[bgsrc${index}]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=24:2,eq=brightness=-0.22[bg${index}]`,
      `[fgsrc${index}]scale=${innerWidth}:${innerHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg${index}]`,
      `[bg${index}][fg${index}]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v${index}]`,
    ].join(';');
  }
  if (input.fit === 'pad') {
    return `[${index}:v:0]${trim},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p[v${index}]`;
  }
  // Edge to edge: the frame is always filled, whatever shape the model returned.
  return `[${index}:v:0]${trim},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p[v${index}]`;
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
      `[${audioSource.get(index)}:a:0]${audioTrim},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${duration}[a${index}]`,
    );
  });
  const pairs = inputs.map((_, index) => `[v${index}][a${index}]`).join('');
  if (params.overlay) {
    // One still image after every other input; overlay repeats its only frame for the whole ad.
    args.push('-i', params.overlay);
    filters.push(`${pairs}concat=n=${inputs.length}:v=1:a=1[vjoined][aout]`);
    filters.push(`[${next}:v:0]scale=${width}:${height},format=rgba[brand]`, `[vjoined][brand]overlay=0:0:format=auto,format=yuv420p[vout]`);
  } else {
    filters.push(`${pairs}concat=n=${inputs.length}:v=1:a=1[vout][aout]`);
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
  const planned = inputs.reduce((sum, input) => sum + input.seconds, 0);
  const measured = (await probeMedia(params.output, params.runner).catch(() => null))?.durationSeconds ?? parseEncodedSeconds(stderr) ?? planned;
  return { durationSeconds: Math.round(Math.min(measured, AD_STUDIO_MAX_TOTAL_SECONDS) * 100) / 100 };
}

/**
 * How a voice-over is laid onto its speechless clip: the narration starts just after the cut, the
 * clip's own sound (music and ambience) is ducked under it, and the clip keeps its length. A line
 * longer than the room it has is sped up a little (at most 25%, which still sounds natural) and, if
 * it still does not fit, cut with a short fade rather than running past the scene.
 */
export const NARRATION_START_SECONDS = 0.2;
/** Silence left after the narration before the next scene's cut. */
export const NARRATION_TAIL_SECONDS = 0.15;
export const NARRATION_MAX_TEMPO = 1.25;
export const NARRATION_FADE_SECONDS = 0.3;
/** The clip's own sound level while the narrator speaks. */
export const NARRATION_DUCKED_VOLUME = 0.25;
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

/** The ffmpeg arguments that lay `narration` (a WAV) onto `video`, keeping the clip's length. */
export function buildNarrationMixArgs(params: { video: string; narration: string; output: string; clipSeconds: number; narrationSeconds: number; clipHasAudio: boolean }): string[] {
  const { video, narration, output, clipSeconds } = params;
  const fit = fitNarration(clipSeconds, params.narrationSeconds);
  const start = NARRATION_START_SECONDS;
  const end = start + fit.seconds;
  const args = ['-hide_banner', '-nostdin', '-y', '-i', video, '-i', narration];
  // A clip with no sound of its own gets a silent bed, so the mix always has two inputs.
  if (!params.clipHasAudio) args.push('-f', 'lavfi', '-t', seconds(clipSeconds), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  const bedInput = params.clipHasAudio ? 0 : 2;
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
    // The clip's sound, ducked while the narrator speaks (with a short ramp on either side).
    `[${bedInput}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,volume='if(between(t,${seconds(start - 0.1)},${seconds(end + 0.2)}),${NARRATION_DUCKED_VOLUME},1)':eval=frame[bed]`,
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
  const args = buildNarrationMixArgs({ video: params.video, narration: params.narration, output: params.output, clipSeconds: clip.durationSeconds, narrationSeconds: voice.durationSeconds, clipHasAudio: clip.hasAudio });
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
