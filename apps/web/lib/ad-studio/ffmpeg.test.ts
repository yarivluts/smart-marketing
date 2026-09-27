// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  buildConcatArgs,
  concatClips,
  defaultFfmpegRunner,
  FfmpegFailedError,
  FfmpegUnavailableError,
  isFfmpegAvailable,
  parseEncodedSeconds,
  parseProbeOutput,
  probeMedia,
  runFfmpeg,
  type FfmpegRunner,
  type SpawnLike,
} from './ffmpeg';

vi.mock('server-only', () => ({}));

/** A fake ffmpeg process: prints `stderr`, then exits with `code` (or fails to start). */
function fakeSpawn(script: (args: string[]) => { stderr?: string; code?: number; error?: NodeJS.ErrnoException }): SpawnLike & { calls: string[][] } {
  const calls: string[][] = [];
  const spawnImpl = ((_command: string, args: string[]) => {
    calls.push(args);
    const outcome = script(args);
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: () => void };
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    setImmediate(() => {
      if (outcome.error) {
        child.emit('error', outcome.error);
        return;
      }
      if (outcome.stderr) child.stderr.emit('data', Buffer.from(outcome.stderr));
      child.emit('close', outcome.code ?? 0);
    });
    return child;
  }) as unknown as SpawnLike & { calls: string[][] };
  spawnImpl.calls = calls;
  return spawnImpl;
}

function runnerWith(spawnImpl: SpawnLike): FfmpegRunner {
  return { ffmpegPath: 'ffmpeg', spawnImpl, timeoutMs: 5_000 };
}

describe('buildConcatArgs', () => {
  it('trims, scales, pads and resamples every clip, adds silence for a mute clip, and caps the output at 60 seconds', () => {
    const args = buildConcatArgs({
      inputs: [
        { file: 'a.mp4', seconds: 5, hasAudio: true },
        { file: 'b.mp4', seconds: 7.5, hasAudio: false },
      ],
      output: 'out.mp4',
      format: 'vertical',
    });
    expect(args.slice(0, 7)).toEqual(['-hide_banner', '-nostdin', '-y', '-i', 'a.mp4', '-i', 'b.mp4']);
    expect(args).toContain('anullsrc=channel_layout=stereo:sample_rate=48000');
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).toContain('[0:v:0]trim=duration=5,setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280');
    expect(filter).toContain('[0:a:0]atrim=duration=5');
    // The mute clip's audio comes from the silent source, input 2.
    expect(filter).toContain('[2:a:0]atrim=duration=7.5');
    expect(filter).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]');
    expect(args.slice(-3)).toEqual(['-t', '60', 'out.mp4']);
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart']));
  });

  it('uses the landscape frame for horizontal ads and refuses an empty list', () => {
    const filter = buildConcatArgs({ inputs: [{ file: 'a.mp4', seconds: 3, hasAudio: true }], output: 'o.mp4', format: 'horizontal' }).join(' ');
    expect(filter).toContain('scale=1280:720');
    expect(() => buildConcatArgs({ inputs: [], output: 'o.mp4', format: 'vertical' })).toThrow();
  });
});

describe('parsing ffmpeg output', () => {
  const PROBE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:00:05.04, start: 0.000000, bitrate: 1200 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 720x1280, 24 fps
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp`;

  it('reads the length and the streams of an input', () => {
    expect(parseProbeOutput(PROBE)).toEqual({ durationSeconds: 5.04, hasVideo: true, hasAudio: true });
    expect(parseProbeOutput('Duration: N/A\n  Stream #0:0: Video: h264')).toEqual({ durationSeconds: null, hasVideo: true, hasAudio: false });
  });

  it('reads the last progress mark as the output length', () => {
    expect(parseEncodedSeconds('frame= 10 time=00:00:01.00 bitrate\nframe= 300 time=00:00:12.48 bitrate')).toBe(12.48);
    expect(parseEncodedSeconds('nothing')).toBeNull();
  });
});

describe('running ffmpeg (spawn mocked)', () => {
  it('probes each clip, joins them with each clip cut to the shorter of scene and clip, and reports the length', async () => {
    const spawnImpl = fakeSpawn((args) => {
      if (!args.includes('-filter_complex')) {
        const file = args[args.indexOf('-i') + 1];
        return {
          code: 1,
          stderr: file === 'a.mp4' ? 'Duration: 00:00:04.00,\n Stream #0:0: Video: h264\n Stream #0:1: Audio: aac' : 'Duration: 00:00:09.00,\n Stream #0:0: Video: h264',
        };
      }
      return { code: 0, stderr: 'time=00:00:10.00 bitrate' };
    });
    const result = await concatClips({ clips: [{ file: 'a.mp4', seconds: 5 }, { file: 'b.mp4', seconds: 6 }], output: 'out.mp4', format: 'vertical', runner: runnerWith(spawnImpl) });
    expect(result).toEqual({ durationSeconds: 10 });
    const concatArgs = spawnImpl.calls[2];
    const filter = concatArgs[concatArgs.indexOf('-filter_complex') + 1];
    expect(filter).toContain('[0:v:0]trim=duration=4,');
    expect(filter).toContain('[1:v:0]trim=duration=6,');
    expect(filter).toContain('[2:a:0]atrim=duration=6');
  });

  it('refuses a clip without video, and reports a failed encode with its log tail', async () => {
    const noVideo = fakeSpawn(() => ({ code: 1, stderr: 'Duration: 00:00:04.00,\n Stream #0:0: Audio: aac' }));
    await expect(concatClips({ clips: [{ file: 'a.mp4', seconds: 5 }], output: 'o.mp4', format: 'vertical', runner: runnerWith(noVideo) })).rejects.toBeInstanceOf(FfmpegFailedError);
    const broken = fakeSpawn((args) => (args.includes('-filter_complex') ? { code: 1, stderr: 'Invalid data found' } : { code: 1, stderr: 'Stream #0:0: Video: h264' }));
    const error = await concatClips({ clips: [{ file: 'a.mp4', seconds: 5 }], output: 'o.mp4', format: 'vertical', runner: runnerWith(broken) }).catch((caught) => caught);
    expect(error).toBeInstanceOf(FfmpegFailedError);
    expect((error as FfmpegFailedError).stderrTail).toContain('Invalid data found');
  });

  it('turns a missing binary into FfmpegUnavailableError, and the availability check into false', async () => {
    const missing = fakeSpawn(() => ({ error: Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }) }));
    await expect(runFfmpeg(['-version'], runnerWith(missing))).rejects.toBeInstanceOf(FfmpegUnavailableError);
    expect(await isFfmpegAvailable({ ffmpegPath: 'missing-ffmpeg-for-test', spawnImpl: missing, timeoutMs: 1000 })).toBe(false);
    expect(defaultFfmpegRunner({ FFMPEG_PATH: '/usr/bin/ffmpeg' } as unknown as NodeJS.ProcessEnv).ffmpegPath).toBe('/usr/bin/ffmpeg');
    expect(defaultFfmpegRunner({} as NodeJS.ProcessEnv).ffmpegPath).toBe('ffmpeg');
  });
});

const realRunner = defaultFfmpegRunner();
const hasFfmpeg = spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-version'], { windowsHide: true }).status === 0;
const workDirs: string[] = [];

afterAll(async () => {
  await Promise.all(workDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe.skipIf(!hasFfmpeg)('with a real ffmpeg binary', () => {
  it('joins a clip with sound and a mute clip of another size into one vertical MP4 with audio', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ad-studio-ffmpeg-'));
    workDirs.push(dir);
    const first = path.join(dir, 'first.mp4');
    const second = path.join(dir, 'second.mp4');
    const make = (args: string[]) => expect(spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true }).status).toBe(0);
    make(['-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', first]);
    make(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=3', '-c:v', 'libx264', second]);

    const output = path.join(dir, 'out.mp4');
    const result = await concatClips({ clips: [{ file: first, seconds: 2 }, { file: second, seconds: 2 }], output, format: 'vertical', runner: realRunner });
    expect(result.durationSeconds).toBeGreaterThan(3.8);
    expect(result.durationSeconds).toBeLessThan(4.3);
    expect((await stat(output)).size).toBeGreaterThan(1000);
    const probe = await probeMedia(output, realRunner);
    expect(probe).toMatchObject({ hasVideo: true, hasAudio: true });
    expect(probe.durationSeconds).toBeGreaterThan(3.8);
  }, 60_000);
});
