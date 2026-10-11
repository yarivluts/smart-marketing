import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComparisonBars } from './comparison-bars';

describe('ComparisonBars', () => {
  it('draws each value on one shared scale, clamped to the track, with its label and display value', () => {
    const { container } = render(
      <ComparisonBars
        label="Baseline 60, current 30"
        max={120}
        bars={[
          { key: 'baseline', label: 'Baseline', value: 60, display: '60' },
          { key: 'current', label: 'Current', value: 300, display: '300', color: 'hsl(var(--warning))' },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Baseline 60, current 30' })).toBeInTheDocument();
    expect(screen.getByText('Baseline')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    const fills = container.querySelectorAll<HTMLDivElement>('.h-full.rounded-full');
    expect(fills[0].style.width).toBe('50%');
    expect(fills[1].style.width).toBe('100%');
  });

  it('does not divide by a zero scale', () => {
    const { container } = render(<ComparisonBars label="empty" max={0} bars={[{ key: 'a', label: 'A', value: 0, display: '0' }]} />);
    expect(container.querySelector<HTMLDivElement>('.h-full.rounded-full')?.style.width).toBe('0%');
  });
});
