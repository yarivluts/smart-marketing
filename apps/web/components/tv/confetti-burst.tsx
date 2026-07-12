'use client';

import { useMemo } from 'react';

export interface ConfettiBurstProps {
  /** Disables the falling-particle animation (plan `10 §4`: "reduced-motion mode (confetti off)") — replaced with a single brief, non-moving highlight flash so a win still reads visually without any vestibular-triggering motion. */
  reducedMotion: boolean;
}

/** Bounds one burst to a fixed, small particle count and a fixed lifetime driven entirely by CSS (`animate-confetti-fall`, `tailwind.config.ts`) — no per-particle JS timer, no unbounded growth across repeated wins, since the parent (`war-room-win-overlay.tsx`) mounts a fresh instance per win and unmounts it once the animation window ends. This is the AC's "runs 24h without leak" concern applied to confetti specifically: however many wins fire over a day, at most one burst's worth of DOM nodes ever exists at once. */
const PARTICLE_COUNT = 48;
const COLORS = ['#f43f5e', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

interface Particle {
  left: number;
  color: string;
  durationSeconds: number;
  delaySeconds: number;
  size: number;
}

function buildParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    left: Math.random() * 100,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    durationSeconds: 2.2 + Math.random() * 1.4,
    delaySeconds: Math.random() * 0.6,
    size: 6 + Math.random() * 8,
  }));
}

export function ConfettiBurst({ reducedMotion }: ConfettiBurstProps): React.ReactElement {
  const particles = useMemo(() => (reducedMotion ? [] : buildParticles()), [reducedMotion]);

  if (reducedMotion) {
    return <div aria-hidden="true" className="pointer-events-none fixed inset-0 animate-pulse bg-primary/10" />;
  }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {particles.map((particle, index) => (
        <span
          key={index}
          className="absolute top-0 block animate-confetti-fall rounded-sm"
          style={{
            left: `${particle.left}%`,
            width: particle.size,
            height: particle.size * 0.4,
            backgroundColor: particle.color,
            animationDuration: `${particle.durationSeconds}s`,
            animationDelay: `${particle.delaySeconds}s`,
          }}
        />
      ))}
    </div>
  );
}
