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
});
