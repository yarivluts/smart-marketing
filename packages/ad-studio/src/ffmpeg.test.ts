// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  AD_STUDIO_TRANSITION_SECONDS,
  buildConcatArgs,
  buildNarrationMixArgs,
  buildScrollVideoArgs,
  concatClips,
  fitNarration,
  mixNarration,
  NARRATION_MAX_TEMPO,
  plannedConcatSeconds,
  renderScrollingPageVideo,
  transitionSecondsBetween,
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
    expect(filter).toContain('[0:v:0]trim=duration=5,setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=0.25,trim=duration=5,setpts=PTS-STARTPTS,format=yuv420p,settb=1/30[v0]');
    expect(filter).not.toContain('color=black');
    expect(filter).toContain('[0:a:0]atrim=duration=5');
    // The mute clip's audio comes from the silent source, input 2.
    expect(filter).toContain('[2:a:0]atrim=duration=7.5');
    expect(filter).toContain('[v0][v1]xfade=transition=fade:duration=0.25:offset=4.75[vout]');
    expect(filter).toContain('[a0][a1]acrossfade=d=0.25:c1=tri:c2=tri[aout]');
    expect(args.slice(-3)).toEqual(['-t', '60', 'out.mp4']);
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart']));
    // Plays in every browser and on iOS: H.264 High at level 4.0, 4:2:0.
    expect(args.join(' ')).toContain('-profile:v high -level:v 4.0');
    expect(args.join(' ')).toContain('-pix_fmt yuv420p');
  });

  it('chains 3 clips with cumulative offsets, keeps single-clip concat, and supports short/zero transition opt-outs', () => {
    expect(AD_STUDIO_TRANSITION_SECONDS).toBe(0.25);
    expect(transitionSecondsBetween(5, 5)).toBe(0.25);
    expect(transitionSecondsBetween(0.3, 5)).toBe(0.1);
    expect(transitionSecondsBetween(0.1, 5)).toBe(0);
    expect(transitionSecondsBetween(5, 5, 0)).toBe(0);
    expect(plannedConcatSeconds([{ seconds: 5 }, { seconds: 6 }, { seconds: 4 }])).toBe(14.5);

    const single = buildConcatArgs({ inputs: [{ file: 'a.mp4', seconds: 3, hasAudio: true }], output: 'o.mp4', format: 'vertical' });
    expect(single[single.indexOf('-filter_complex') + 1]).toContain('[v0][a0]concat=n=1:v=1:a=1[vout][aout]');

    const three = buildConcatArgs({
      inputs: [
        { file: 'a.mp4', seconds: 4, hasAudio: true },
        { file: 'b.mp4', seconds: 3, hasAudio: false },
        { file: 'c.mp4', seconds: 5, hasAudio: true },
      ],
      output: 'o.mp4',
      format: 'vertical',
    });
    const threeFilter = three[three.indexOf('-filter_complex') + 1];
    expect(threeFilter).toContain('[v0][v1]xfade=transition=fade:duration=0.25:offset=3.75[vx1]');
    expect(threeFilter).toContain('[a0][a1]acrossfade=d=0.25:c1=tri:c2=tri[ax1]');
    expect(threeFilter).toContain('[vx1][v2]xfade=transition=fade:duration=0.25:offset=6.5[vout]');
    expect(threeFilter).toContain('[ax1][a2]acrossfade=d=0.25:c1=tri:c2=tri[aout]');

    const noFade = buildConcatArgs({
      inputs: [
        { file: 'a.mp4', seconds: 4, hasAudio: true },
        { file: 'b.mp4', seconds: 4, hasAudio: true },
      ],
      output: 'o.mp4',
      format: 'vertical',
      transitionSeconds: 0,
    });
    expect(noFade[noFade.indexOf('-filter_complex') + 1]).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]');

    const tinyClip = buildConcatArgs({
      inputs: [
        { file: 'a.mp4', seconds: 4, hasAudio: true },
        { file: 'b.mp4', seconds: 0.1, hasAudio: true },
      ],
      output: 'o.mp4',
      format: 'vertical',
    });
    expect(tinyClip[tinyClip.indexOf('-filter_complex') + 1]).toContain('[v0][a0][v1][a1]concat=n=2:v=1:a=1[vout][aout]');
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
    expect(filter).toContain('[v0][v1]xfade=transition=fade:duration=0.25:offset=4.75[vjoined]');
    expect(filter).toContain('[a0][a1]acrossfade=d=0.25:c1=tri:c2=tri[aout]');
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
    expect(result.durationSeconds).toBeGreaterThan(3.55);
    expect(result.durationSeconds).toBeLessThan(4.05);
    expect((await stat(output)).size).toBeGreaterThan(1000);
    const probe = await probeMedia(output, realRunner);
    expect(probe).toMatchObject({ hasVideo: true, hasAudio: true });
    expect(probe.durationSeconds).toBeGreaterThan(3.55);
  }, 60_000);

  it('smoothly crossfades frames across the cut without fading in from black at t=0', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ad-studio-ffmpeg-'));
    workDirs.push(dir);
    const bright = path.join(dir, 'bright.mp4');
    const dark = path.join(dir, 'dark.mp4');
    const make = (args: string[]) => expect(spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true }).status).toBe(0);
    make(['-f', 'lavfi', '-i', 'color=c=white:size=360x640:rate=24:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', bright]);
    make(['-f', 'lavfi', '-i', 'color=c=black:size=640x360:rate=30:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', dark]);

    const output = path.join(dir, 'fade.mp4');
    const result = await concatClips({ clips: [{ file: bright, seconds: 2 }, { file: dark, seconds: 2 }], output, format: 'vertical', runner: realRunner });
    expect(result.durationSeconds).toBeGreaterThan(3.55);
    expect(result.durationSeconds).toBeLessThan(4.05);

    const { default: sharp } = await import('sharp');
    const centerLum = async (atSeconds: number): Promise<number> => {
      const framePath = path.join(dir, `frame-${atSeconds}.png`);
      expect(spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(atSeconds), '-i', output, '-frames:v', '1', framePath], { windowsHide: true }).status).toBe(0);
      const { data, info } = await sharp(framePath).raw().toBuffer({ resolveWithObject: true });
      const idx = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
      return data[idx];
    };

    // Start frame stays bright (#t=0.001/#t=0.1 thumbnails), midpoint of the 1.75s..2.00s transition is grey, and second clip is dark.
    expect(await centerLum(0.05)).toBeGreaterThan(225);
    expect(await centerLum(1.0)).toBeGreaterThan(225);
    const mid = await centerLum(1.875);
    expect(mid).toBeGreaterThan(60);
    expect(mid).toBeLessThan(195);
    expect(await centerLum(2.5)).toBeLessThan(30);
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

describe('laying a voice-over onto its speechless clip', () => {
  it('fits the narration: as spoken when it fits, sped up to at most 25%, then cut with a fade', () => {
    expect(fitNarration(5, 3)).toEqual({ tempo: 1, seconds: 3, trimmed: false });
    const faster = fitNarration(5, 5);
    expect(faster.tempo).toBeCloseTo(5 / 4.65, 4);
    expect(faster.seconds).toBeCloseTo(4.65, 4);
    expect(faster.trimmed).toBe(false);
    expect(fitNarration(5, 8)).toEqual({ tempo: NARRATION_MAX_TEMPO, seconds: expect.closeTo(4.65, 6), trimmed: true });
  });

  it('starts the narration at 0.2s over a silent bed, never reads the clip sound, keeps the clip length and encodes H.264/AAC with faststart', () => {
    const args = buildNarrationMixArgs({ video: 'clip.mp4', narration: 'voice.wav', output: 'out.mp4', clipSeconds: 6, narrationSeconds: 4 });
    const graph = args[args.indexOf('-filter_complex') + 1];
    expect(graph).toContain('adelay=200:all=1');
    expect(graph).not.toContain('atempo');
    expect(args.join(' ')).toContain('-f lavfi -t 6 -i anullsrc');
    expect(graph).toContain('[2:a:0]aresample=48000');
    // The video model's own sound is muted outright: no input-0 audio anywhere in the graph or maps.
    expect(graph).not.toContain('[0:a');
    expect(graph).not.toContain('volume=');
    expect(args.filter((arg, index) => args[index - 1] === '-map')).toEqual(['0:v:0', '[aout]']);
    expect(graph).toContain('amix=inputs=2:duration=first');
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart']));
    expect(args.slice(-3)).toEqual(['-t', '6', 'out.mp4']);
    // A long line is sped up and cut with a fade.
    const long = buildNarrationMixArgs({ video: 'clip.mp4', narration: 'voice.wav', output: 'out.mp4', clipSeconds: 5, narrationSeconds: 9 });
    const longGraph = long[long.indexOf('-filter_complex') + 1];
    expect(long.join(' ')).toContain('-f lavfi -t 5 -i anullsrc');
    expect(longGraph).toContain('atempo=1.2500');
    expect(longGraph).toContain('atrim=duration=4.65,afade=t=out:st=4.35:d=0.3');
  });
});

describe.skipIf(!hasFfmpeg)('a voice-over mixed with a real ffmpeg binary', () => {
  async function makeFiles(clipArgs: string[], toneSeconds: number) {
    const dir = await mkdtemp(path.join(tmpdir(), 'ad-studio-narration-'));
    workDirs.push(dir);
    const clip = path.join(dir, 'clip.mp4');
    const voice = path.join(dir, 'voice.wav');
    const make = (args: string[]) => expect(spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true }).status).toBe(0);
    make([...clipArgs, clip]);
    // The "narration": a tone at the speech model's format, 24 kHz 16-bit mono WAV.
    make(['-f', 'lavfi', '-i', `sine=frequency=660:sample_rate=24000:duration=${toneSeconds}`, '-ac', '1', '-c:a', 'pcm_s16le', voice]);
    return { dir, clip, voice, output: path.join(dir, 'narrated.mp4') };
  }

  it('lays the narration onto a clip with music: same length, H.264 + AAC, audio present', async () => {
    const files = await makeFiles(['-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=24:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 2);
    const fit = await mixNarration({ video: files.clip, narration: files.voice, output: files.output, runner: realRunner });
    expect(fit).toMatchObject({ tempo: 1, trimmed: false });
    const probe = await runFfmpeg(['-hide_banner', '-nostdin', '-i', files.output], realRunner);
    const info = parseProbeOutput(probe.stderr);
    expect(info).toMatchObject({ hasVideo: true, hasAudio: true });
    expect(info.durationSeconds).toBeGreaterThan(3.8);
    expect(info.durationSeconds).toBeLessThan(4.2);
    expect(probe.stderr).toMatch(/Video: h264/);
    expect(probe.stderr).toMatch(/yuv420p/);
    expect(probe.stderr).toMatch(/Audio: aac/);
  }, 60_000);

  it('mutes the clip: a loud tone in the clip sound is gone after the mix, only the narration is heard, and the audio runs the clip length', async () => {
    // The clip's "voices": a 3 kHz tone for its whole length. The narration is a 660 Hz tone.
    const files = await makeFiles(['-f', 'lavfi', '-i', 'testsrc=size=360x640:rate=24:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=3000:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'], 2);
    // Peak level (dB) of one frequency band of a file's audio, optionally only from `from` seconds on.
    const bandPeak = async (file: string, frequency: number, from = 0) => {
      const { stderr } = await runFfmpeg(['-hide_banner', '-nostdin', '-ss', String(from), '-i', file, '-vn', '-af', `bandpass=f=${frequency}:width_type=h:w=200,volumedetect`, '-f', 'null', '-'], realRunner);
      const match = /max_volume: (-?[\d.]+|-inf) dB/.exec(stderr);
      return match ? (match[1] === '-inf' ? -Infinity : Number(match[1])) : Number.NaN;
    };
    // lavfi's sine peaks at 1/8 full scale (about -18 dB), the same for both tones.
    expect(await bandPeak(files.clip, 3000)).toBeGreaterThan(-25);
    await mixNarration({ video: files.clip, narration: files.voice, output: files.output, runner: realRunner });
    // Ducked to 25% the clip tone would still peak near -30 dB; muted, all that is left in its band is
    // the narration's own skirt and codec noise, and nothing at all once the narration has ended.
    expect(await bandPeak(files.output, 3000)).toBeLessThan(-45);
    expect(await bandPeak(files.output, 3000, 2.6)).toBeLessThan(-70);
    expect(await bandPeak(files.output, 660)).toBeGreaterThan(-25);
    // After the narration ends (0.2 s + 2 s) the soundtrack is the silent bed, still running.
    const tail = await runFfmpeg(['-hide_banner', '-nostdin', '-ss', '2.6', '-i', files.output, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], realRunner);
    expect(tail.stderr).toMatch(/max_volume: (-inf|-[6-9]\d(\.\d+)?|-\d{3}(\.\d+)?) dB/);
    const info = await probeMedia(files.output, realRunner);
    expect(info).toMatchObject({ hasVideo: true, hasAudio: true });
    const audioOnly = await runFfmpeg(['-hide_banner', '-nostdin', '-i', files.output, '-vn', '-f', 'null', '-'], realRunner);
    const audioSeconds = parseEncodedSeconds(audioOnly.stderr) ?? 0;
    expect(audioSeconds).toBeGreaterThan(3.8);
    expect(audioSeconds).toBeLessThan(4.2);
  }, 60_000);

  it('speeds up and cuts a narration longer than a silent clip, and the result still runs the clip length', async () => {
    const files = await makeFiles(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p'], 6);
    const fit = await mixNarration({ video: files.clip, narration: files.voice, output: files.output, runner: realRunner });
    expect(fit).toMatchObject({ tempo: NARRATION_MAX_TEMPO, trimmed: true });
    const info = await probeMedia(files.output, realRunner);
    expect(info).toMatchObject({ hasVideo: true, hasAudio: true });
    expect(info.durationSeconds).toBeGreaterThan(2.8);
    expect(info.durationSeconds).toBeLessThan(3.2);
    expect((await stat(files.output)).size).toBeGreaterThan(1000);
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
    expect(graph).toContain('[bg1][fg1]overlay=(W-w)/2:(H-h)/2,setsar=1,tpad=stop_mode=clone:stop_duration=0.25,trim=duration=5,setpts=PTS-STARTPTS,format=yuv420p,settb=1/30[v1]');
    // The silent moment gets a silent track of its own length, from the start.
    expect(args.join(' ')).toContain('-f lavfi -t 5 -i anullsrc=channel_layout=stereo:sample_rate=48000');
    expect(graph).toContain('[2:a:0]atrim=duration=5,');
    // The scene clip keeps the plain, full-frame fit.
    expect(graph).toContain('[0:v:0]trim=duration=4,setpts=PTS-STARTPTS,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280');
    expect(graph).toContain('[v0][v1]xfade=transition=fade:duration=0.25:offset=3.75[vout]');
    expect(graph).toContain('[a0][a1]acrossfade=d=0.25:c1=tri:c2=tri[aout]');
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
    expect(result.durationSeconds).toBeGreaterThan(4.55);
    expect(result.durationSeconds).toBeLessThan(5.1);
    expect(await probeMedia(output, realRunner)).toMatchObject({ hasVideo: true, hasAudio: true });
  }, 60_000);
});

describe('scrolling website capture video', () => {
  it('builds smooth eased vertical crop args without shell quotes', () => {
    const args = buildScrollVideoArgs({
      image: 'sheet.png',
      output: 'scroll.mp4',
      sheetWidth: 1440,
      sheetHeight: 4800,
      frameWidth: 720,
      frameHeight: 1280,
      durationSeconds: 4,
    });
    expect(args).toContain('-loop');
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).not.toContain("'");
    expect(filter).toContain('crop=1440:2560:0:if(lt(t\\,0.45)\\,0\\,if(gt(t\\,3.6)\\,2240\\,2240*(0.5-0.5*cos(PI*(t-0.45)/3.15))))');
    expect(filter).toContain('scale=720:1280:flags=bilinear,setsar=1,fps=30,format=yuv420p[vout]');
    expect(filter).toContain('[1:a:0]atrim=duration=4,asetpts=PTS-STARTPTS[aout]');
  });

  it.skipIf(!hasFfmpeg)('renders a tall PNG into a smooth scrolling MP4 moving from top to bottom', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ad-studio-scroll-test-'));
    workDirs.push(dir);
    const { default: sharp } = await import('sharp');
    // Top half bright white, bottom half near black.
    const tallPng = await sharp({
      create: { width: 720, height: 3600, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .composite([
        {
          input: { create: { width: 720, height: 1800, channels: 3, background: { r: 245, g: 245, b: 245 } } },
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    const output = path.join(dir, 'page-scroll.mp4');
    const rendered = await renderScrollingPageVideo({
      imageBytes: tallPng,
      output,
      format: 'vertical',
      durationSeconds: 3,
      runner: realRunner,
    });
    expect(rendered.durationSeconds).toBe(3);
    const probe = await probeMedia(output, realRunner);
    expect(probe).toMatchObject({ hasVideo: true, hasAudio: true });
    expect(probe.durationSeconds).toBeGreaterThan(2.8);

    const lumAt = async (atSeconds: number): Promise<number> => {
      const frameFile = path.join(dir, `scroll-frame-${atSeconds}.png`);
      expect(spawnSync(realRunner.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(atSeconds), '-i', output, '-frames:v', '1', frameFile], { windowsHide: true }).status).toBe(0);
      const { data, info } = await sharp(frameFile).raw().toBuffer({ resolveWithObject: true });
      const idx = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
      return data[idx];
    };

    expect(await lumAt(0.1)).toBeGreaterThan(220);
    expect(await lumAt(2.8)).toBeLessThan(35);
  }, 60_000);

  it('renders a page whose scaled height comes out odd (no "bad extract area")', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ad-studio-scroll-odd-'));
    workDirs.push(dir);
    const { default: sharp } = await import('sharp');
    // Vertical sheets are 2160 wide; a 2160 x 5001 page keeps width and lands on an odd height
    // between the minimum and the cap - the branch that used to round up past the bottom edge.
    const oddPng = await sharp({ create: { width: 2160, height: 5001, channels: 3, background: { r: 200, g: 200, b: 200 } } })
      .png()
      .toBuffer();
    const output = path.join(dir, 'odd-scroll.mp4');
    const rendered = await renderScrollingPageVideo({ imageBytes: oddPng, output, format: 'vertical', durationSeconds: 1, runner: realRunner });
    expect(rendered.durationSeconds).toBe(1);
    expect((await probeMedia(output, realRunner)).hasVideo).toBe(true);
  }, 60_000);
});
