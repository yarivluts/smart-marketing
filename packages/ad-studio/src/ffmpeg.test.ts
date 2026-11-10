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
  it('trims, scales to cover, crops and resamples every clip, adds silence for a mute clip, and caps the output at 60 seconds', () => {
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
    // Cover, never letterbox: a clip of another shape fills the frame and is cropped from the centre.
    expect(filter).toContain('[0:v:0]trim=duration=5,setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1');
    expect(filter).not.toContain('color=black');
    expect(filter).toContain('[0:a:0]atrim=duration=5');
    // The mute clip's audio comes from the silent source, input 2.
    expect(filter).toContain('[2:a:0]atrim=duration=7.5');
    expect(filter).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]');
    expect(args.slice(-3)).toEqual(['-t', '60', 'out.mp4']);
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart']));
    // Plays in every browser and on iOS: H.264 High at level 4.0, 4:2:0.
    expect(args.join(' ')).toContain('-profile:v high -level:v 4.0');
    expect(args.join(' ')).toContain('-pix_fmt yuv420p');
  });

  it('still letterboxes a clip asked to pad', () => {
    const filter = buildConcatArgs({ inputs: [{ file: 'a.mp4', seconds: 3, hasAudio: true, fit: 'pad' }], output: 'o.mp4', format: 'vertical' }).join(' ');
    expect(filter).toContain('force_original_aspect_ratio=decrease,pad=720:1280');
  });

  it('uses the landscape frame for horizontal ads and refuses an empty list', () => {
    const filter = buildConcatArgs({ inputs: [{ file: 'a.mp4', seconds: 3, hasAudio: true }], output: 'o.mp4', format: 'horizontal' }).join(' ');
    expect(filter).toContain('scale=1280:720');
    expect(() => buildConcatArgs({ inputs: [], output: 'o.mp4', format: 'vertical' })).toThrow();
  });

  it('joins 1080p clips at 1080p and every other resolution at 720p', () => {
    const input = [{ file: 'a.mp4', seconds: 3, hasAudio: true }];
    expect(buildConcatArgs({ inputs: input, output: 'o.mp4', format: 'vertical', resolution: '1080p' }).join(' ')).toContain('scale=1080:1920');
    expect(buildConcatArgs({ inputs: input, output: 'o.mp4', format: 'horizontal', resolution: '1080p' }).join(' ')).toContain('scale=1920:1080');
    expect(buildConcatArgs({ inputs: input, output: 'o.mp4', format: 'vertical', resolution: '360p' }).join(' ')).toContain('scale=720:1280');
  });

  it('lays the brand strip PNG over every frame, as the last input', () => {
    const args = buildConcatArgs({
      inputs: [
        { file: 'a.mp4', seconds: 5, hasAudio: true },
        { file: 'b.mp4', seconds: 4, hasAudio: false },
      ],
      output: 'o.mp4',
      format: 'vertical',
      overlay: 'brand.png',
    });
    // Clips 0-1, the silence for clip b is 2, the overlay is 3.
    expect(args.slice(args.lastIndexOf('-i'), args.lastIndexOf('-i') + 2)).toEqual(['-i', 'brand.png']);
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).toContain('concat=n=2:v=1:a=1[vjoined][aout]');
    expect(filter).toContain('[3:v:0]scale=720:1280,format=rgba[brand]');
    expect(filter).toContain('[vjoined][brand]overlay=0:0');
    expect(filter).toMatch(/\[vout\]$/);
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
        if (file === 'out.mp4') return { code: 1, stderr: 'Duration: 00:00:10.02,\n Stream #0:0: Video: h264\n Stream #0:1: Audio: aac' };
        return {
          code: 1,
          stderr: file === 'a.mp4' ? 'Duration: 00:00:04.00,\n Stream #0:0: Video: h264\n Stream #0:1: Audio: aac' : 'Duration: 00:00:09.00,\n Stream #0:0: Video: h264',
        };
      }
      return { code: 0, stderr: 'time=00:00:09.96 bitrate' };
    });
    const result = await concatClips({ clips: [{ file: 'a.mp4', seconds: 5 }, { file: 'b.mp4', seconds: 6 }], output: 'out.mp4', format: 'vertical', runner: runnerWith(spawnImpl) });
    // Measured from the written file, not the trailing progress mark.
    expect(result).toEqual({ durationSeconds: 10.02 });
    expect(spawnImpl.calls).toHaveLength(4);
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

  it('joins clips under a brand strip overlay', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ad-studio-ffmpeg-'));
    workDirs.push(dir);
    const clip = path.join(dir, 'clip.mp4');
    expect(spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=24:duration=2', '-c:v', 'libx264', clip], { windowsHide: true }).status).toBe(0);
    const overlay = path.join(dir, 'brand.png');
    const { default: sharp } = await import('sharp');
    await sharp({ create: { width: 720, height: 1280, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: { create: { width: 720, height: 120, channels: 4, background: '#1e3a8a' } }, top: 900, left: 0 }])
      .png()
      .toFile(overlay);
    const output = path.join(dir, 'branded.mp4');
    const result = await concatClips({ clips: [{ file: clip, seconds: 2 }], output, format: 'vertical', overlay, runner: realRunner });
    expect(result.durationSeconds).toBeGreaterThan(1.8);
    expect(await probeMedia(output, realRunner)).toMatchObject({ hasVideo: true, hasAudio: true });
  }, 60_000);

  it('fills a vertical frame edge to edge with a landscape clip - no black bars', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ad-studio-ffmpeg-'));
    workDirs.push(dir);
    // A plain white landscape clip: any letterbox or pillarbox would show up as black rows or columns.
    const clip = path.join(dir, 'wide.mp4');
    expect(spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:size=1280x720:rate=24:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip], { windowsHide: true }).status).toBe(0);
    const output = path.join(dir, 'filled.mp4');
    await concatClips({ clips: [{ file: clip, seconds: 2 }], output, format: 'vertical', runner: realRunner });
    const frame = path.join(dir, 'frame.png');
    expect(spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', output, '-frames:v', '1', frame], { windowsHide: true }).status).toBe(0);
    const { default: sharp } = await import('sharp');
    const { data, info } = await sharp(frame).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([720, 1280]);
    const at = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    for (const [x, y] of [[2, 2], [717, 2], [360, 2], [360, 1277], [2, 640], [717, 640], [2, 1277], [717, 1277]]) expect(at(x, y)).toBeGreaterThan(200);
  }, 60_000);
});

describe('screen recordings in an ad', () => {
  it('cuts a moment from its start and shows it inside the frame on a blurred, darkened copy (vertical)', () => {
    const args = buildConcatArgs({
      inputs: [
        { file: 'hook.mp4', seconds: 4, hasAudio: true },
        { file: 'demo.mp4', seconds: 5, hasAudio: false, startSeconds: 12.5, fit: 'screen' },
      ],
      output: 'out.mp4',
      format: 'vertical',
    });
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('[1:v:0]trim=start=12.5:duration=5,setpts=PTS-STARTPTS,fps=30,split=2[bgsrc1][fgsrc1]');
    expect(graph).toContain('[bgsrc1]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=24:2,eq=brightness=-0.22[bg1]');
    expect(graph).toContain('[fgsrc1]scale=662:1178:force_original_aspect_ratio=decrease:force_divisible_by=2[fg1]');
    expect(graph).toContain('[bg1][fg1]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v1]');
    // The silent moment gets a silent track of its own length, from the start.
    expect(args.join(' ')).toContain('-f lavfi -t 5 -i anullsrc=channel_layout=stereo:sample_rate=48000');
    expect(graph).toContain('[2:a:0]atrim=duration=5,');
    // The scene clip keeps the plain, full-frame fit.
    expect(graph).toContain('[0:v:0]trim=duration=4,setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280');
    expect(graph).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1');
  });

  it('frames a moment in a horizontal ad too, and trims a clip with sound from the same start', () => {
    const args = buildConcatArgs({ inputs: [{ file: 'demo.mp4', seconds: 3, hasAudio: true, startSeconds: 2, fit: 'screen' }], output: 'out.mp4', format: 'horizontal', resolution: '1080p' });
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('crop=1920:1080');
    expect(graph).toContain('scale=1766:994:force_original_aspect_ratio=decrease');
    expect(graph).toContain('[0:a:0]atrim=start=2:duration=3,');
  });
});

describe.skipIf(!hasFfmpeg)('a screen recording with a real ffmpeg binary', () => {
  it('joins a scene and a framed moment cut from the middle of a recording', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ad-studio-ffmpeg-'));
    workDirs.push(dir);
    const scene = path.join(dir, 'scene.mp4');
    const demo = path.join(dir, 'demo.mp4');
    const make = (args: string[]) => expect(spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true }).status).toBe(0);
    make(['-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', scene]);
    make(['-f', 'lavfi', '-i', 'testsrc=size=1280x800:rate=30:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', demo]);
    const output = path.join(dir, 'out.mp4');
    const result = await concatClips({ clips: [{ file: scene, seconds: 2 }, { file: demo, seconds: 3, startSeconds: 4, fit: 'screen' }], output, format: 'vertical', runner: realRunner });
    expect(result.durationSeconds).toBeGreaterThan(4.7);
    expect(result.durationSeconds).toBeLessThan(5.4);
    expect(await probeMedia(output, realRunner)).toMatchObject({ hasVideo: true, hasAudio: true });
  }, 60_000);
});
