import { spawn } from 'node:child_process';
import { AD_STUDIO_MAX_TOTAL_SECONDS, type AdStudioFormat } from '@growthos/shared';

/**
 * Joins scene clips into the finished ad with ffmpeg (KAN-231). The binary comes from FFMPEG_PATH
 * (default `ffmpeg`, installed in the web runtime image).
 *
 * Every clip is re-encoded rather than stream-copied: clips from the same model usually match, but
 * a concat-copy silently breaks on any difference in resolution, frame rate, timebase or audio
 * layout, and an edit may come back in a different shape. So each input is trimmed to its scene's
 * scripted length, scaled and padded to one frame size, set to one frame rate, and given a stereo
 * 48 kHz track (silence when a clip has no audio) before the concat filter; the output is H.264 +
 * AAC with the index at the front for streaming, capped at 60 seconds.
 *
 * No text is drawn onto the video: see the on-screen text decision in `@growthos/shared`'s
 * `ad-studio/video.ts`.
 */

export const AD_STUDIO_FRAME: Record<AdStudioFormat, { width: number; height: number }> = {
  vertical: { width: 720, height: 1280 },
  horizontal: { width: 1280, height: 720 },
};
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
}

function seconds(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** The full ffmpeg argument list for joining `inputs` in order into `output`. */
export function buildConcatArgs(params: { inputs: readonly ConcatInput[]; output: string; format: AdStudioFormat; fps?: number; maxSeconds?: number }): string[] {
  const { inputs, output, format } = params;
  if (inputs.length === 0) throw new Error('Nothing to join.');
  const fps = params.fps ?? AD_STUDIO_FPS;
  const { width, height } = AD_STUDIO_FRAME[format];
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
    filters.push(
      `[${index}:v:0]trim=duration=${duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps},format=yuv420p[v${index}]`,
      `[${audioSource.get(index)}:a:0]atrim=duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${duration}[a${index}]`,
    );
  });
  const pairs = inputs.map((_, index) => `[v${index}][a${index}]`).join('');
  filters.push(`${pairs}concat=n=${inputs.length}:v=1:a=1[vout][aout]`);

  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
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
export async function concatClips(params: { clips: readonly { file: string; seconds: number }[]; output: string; format: AdStudioFormat; runner: FfmpegRunner }): Promise<{ durationSeconds: number }> {
  const inputs: ConcatInput[] = [];
  for (const clip of params.clips) {
    const probe = await probeMedia(clip.file, params.runner);
    if (!probe.hasVideo) throw new FfmpegFailedError('A clip has no video stream.', '');
    inputs.push({ file: clip.file, seconds: probe.durationSeconds ? Math.min(clip.seconds, probe.durationSeconds) : clip.seconds, hasAudio: probe.hasAudio });
  }
  const { code, stderr } = await runFfmpeg(buildConcatArgs({ inputs, output: params.output, format: params.format }), params.runner);
  if (code !== 0) throw new FfmpegFailedError(`ffmpeg exited with code ${code}.`, stderr.slice(-2000));
  // The container's own length is the most accurate; the last progress mark trails it slightly.
  const planned = inputs.reduce((sum, input) => sum + input.seconds, 0);
  const measured = (await probeMedia(params.output, params.runner).catch(() => null))?.durationSeconds ?? parseEncodedSeconds(stderr) ?? planned;
  return { durationSeconds: Math.round(Math.min(measured, AD_STUDIO_MAX_TOTAL_SECONDS) * 100) / 100 };
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
