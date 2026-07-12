import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playWinChime, resetAudioContextForTests } from './win-chime';

class FakeOscillatorNode {
  public type = 'sine';
  public frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGainNode {
  public gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect = vi.fn();
}

class FakeAudioContext {
  public currentTime = 0;
  public destination = {};
  createOscillator = vi.fn(() => new FakeOscillatorNode());
  createGain = vi.fn(() => new FakeGainNode());
}

describe('playWinChime', () => {
  beforeEach(() => {
    resetAudioContextForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAudioContextForTests();
  });

  it('never throws when the browser has no AudioContext (jsdom default)', () => {
    expect(() => playWinChime('generic')).not.toThrow();
  });

  it('plays a longer note sequence for a more significant win type', () => {
    let created: FakeAudioContext | null = null;
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => {
        created = new FakeAudioContext();
        return created;
      }),
    );

    playWinChime('generic');
    const genericNoteCount = created!.createOscillator.mock.calls.length;

    playWinChime('trial_conversion');
    const trialConversionNoteCount = created!.createOscillator.mock.calls.length - genericNoteCount;

    expect(genericNoteCount).toBeGreaterThan(0);
    expect(trialConversionNoteCount).toBeGreaterThan(genericNoteCount);
  });

  it('never throws even if the AudioContext itself throws mid-sequence', () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ({
        currentTime: 0,
        destination: {},
        createOscillator: () => {
          throw new Error('boom');
        },
        createGain: () => new FakeGainNode(),
      })),
    );

    expect(() => playWinChime('reactivation')).not.toThrow();
  });
});
