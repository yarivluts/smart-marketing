import type { WinType } from '@growthos/shared';

/**
 * Celebration sound per win type (KAN-67 AC: "confetti + sound per win
 * type", plan `10 §2.3`). Synthesized on the fly via the Web Audio API
 * instead of shipping audio asset files — no license/build-pipeline concerns
 * for a handful of short tones, and it keeps this feature dependency-free
 * (see this story's PR description for why hand-rolled confetti took the
 * same approach). Each win type gets its own short ascending tone sequence
 * so a war-room can tell a `reactivation` chime from a `trial_conversion`
 * fanfare by ear without looking at the screen — `generic` is the plainest
 * (a single chime), the other two layer on more notes the same way KAN-66's
 * win-catalog itself treats `generic` as the baseline every other type adds
 * meaning on top of.
 */
const CHIME_SEQUENCES: Record<WinType, number[]> = {
  generic: [880],
  reactivation: [660, 880],
  trial_conversion: [523.25, 659.25, 783.99],
};

const NOTE_DURATION_SECONDS = 0.18;
const NOTE_GAP_SECONDS = 0.05;

/** One process-wide `AudioContext`, created lazily on first use — browsers require a user gesture before audio can play, and the pairing screen's own "press to pair"/fullscreen affordance (see `tv-app.tsx`) provides that gesture before any win could plausibly fire. */
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return null;
  }
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

/** Test-only escape hatch — clears the process-wide singleton so `win-chime.test.ts` can swap in a fresh mocked `AudioContext` per test instead of reusing whichever one an earlier test already created. Never called from application code. */
export function resetAudioContextForTests(): void {
  sharedAudioContext = null;
}

/** Plays one win type's chime. Never throws — a browser that blocks audio (no user gesture yet, autoplay policy) degrades to silence rather than breaking the rest of the win overlay. */
export function playWinChime(winType: WinType): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }
  try {
    const notes = CHIME_SEQUENCES[winType] ?? CHIME_SEQUENCES.generic;
    let startTime = context.currentTime;
    for (const frequency of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + NOTE_DURATION_SECONDS);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + NOTE_DURATION_SECONDS);
      startTime += NOTE_DURATION_SECONDS + NOTE_GAP_SECONDS;
    }
  } catch {
    // Best-effort — see this function's own doc comment.
  }
}
