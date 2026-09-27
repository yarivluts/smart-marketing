import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressRing } from './progress-ring';

describe('ProgressRing', () => {
  it('is a named image showing the rounded percentage by default', () => {
    render(<ProgressRing percent={66.6} label="4 of 6 connected" />);
    const ring = screen.getByRole('img', { name: '4 of 6 connected' });
    expect(ring).toHaveAttribute('data-percent', '67');
    expect(ring).toHaveTextContent('67%');
  });

  it('clamps out-of-range and non-finite values', () => {
    const { rerender } = render(<ProgressRing percent={140} label="over" />);
    expect(screen.getByRole('img', { name: 'over' })).toHaveAttribute('data-percent', '100');
    rerender(<ProgressRing percent={Number.NaN} label="over" />);
    expect(screen.getByRole('img', { name: 'over' })).toHaveAttribute('data-percent', '0');
  });

  it('draws an arc proportional to the percent and shows a custom center', () => {
    const { container } = render(<ProgressRing percent={50} label="half" centerValue="3/6" centerLabel="done" size={100} strokeWidth={10} />);
    const arc = container.querySelectorAll('circle')[1];
    const circumference = 2 * Math.PI * 45;
    expect(arc.getAttribute('stroke-dasharray')).toBe(`${circumference / 2} ${circumference}`);
    expect(screen.getByText('3/6')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
  });
});
