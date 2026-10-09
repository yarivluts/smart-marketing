import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('renders title, value, and period', () => {
    render(
      <StatCard
        title="Total Revenue"
        value="$124,500"
        change="+14.2%"
        period="vs last month"
        icon={Activity}
      />,
    );
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('$124,500')).toBeInTheDocument();
    expect(screen.getByText('+14.2%')).toBeInTheDocument();
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('guarantees dir="ltr" for numeric value', () => {
    render(<StatCard title="Conversions" value="1,840" />);
    const valElement = screen.getByText('1,840');
    expect(valElement).toHaveAttribute('dir', 'ltr');
  });

  it('renders progress bar when progress prop is provided', () => {
    render(
      <StatCard
        title="Monthly Goal"
        value="$80,000"
        progress={80}
        targetHint="Target: $100k"
      />,
    );
    expect(screen.getByText('Target: $100k')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('shows a value made of words in a smaller style with automatic direction', () => {
    // "no data yet" in Hebrew, written with escapes: code files carry no Hebrew literals.
    const noData = '\u05d0\u05d9\u05df \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd';
    render(
      <>
        <StatCard title="Revenue" value={noData} />
        <StatCard title="Time zone" value="Asia/Jerusalem" />
      </>,
    );
    for (const text of [noData, 'Asia/Jerusalem']) {
      const value = screen.getByText(text);
      expect(value).not.toHaveClass('text-pp-metric');
      expect(value).toHaveAttribute('dir', 'auto');
    }
    expect(screen.queryByText('1,840')).not.toBeInTheDocument();
  });

  it('draws the accent as an inner bar clipped by the card, not a curved border', () => {
    const { container } = render(<StatCard title="Signups" value={3} data-testid="card" />);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('overflow-hidden');
    expect(card.className).not.toMatch(/border-s-4/);
    expect(container.querySelector('span[aria-hidden="true"].bg-pp-primary')).not.toBeNull();
    expect(screen.getByText('3')).toHaveClass('text-pp-metric');
  });
});
