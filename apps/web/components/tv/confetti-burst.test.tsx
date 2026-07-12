import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ConfettiBurst } from './confetti-burst';

describe('ConfettiBurst', () => {
  it('renders a bounded number of particles when motion is allowed', () => {
    const { container } = render(<ConfettiBurst reducedMotion={false} />);
    const particles = container.querySelectorAll('span');
    expect(particles.length).toBeGreaterThan(0);
    expect(particles.length).toBeLessThanOrEqual(60);
  });

  it('renders no falling particles in reduced-motion mode', () => {
    const { container } = render(<ConfettiBurst reducedMotion={true} />);
    expect(container.querySelectorAll('span').length).toBe(0);
  });

  it('marks itself aria-hidden so it never interferes with screen readers', () => {
    const { container } = render(<ConfettiBurst reducedMotion={false} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
