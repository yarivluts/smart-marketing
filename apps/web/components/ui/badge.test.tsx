import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders children correctly', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies variant classes for success and warning', () => {
    const { rerender } = render(<Badge variant="success">Positive</Badge>);
    expect(screen.getByText('Positive')).toHaveClass('bg-emerald-50');

    rerender(<Badge variant="warning">Caution</Badge>);
    expect(screen.getByText('Caution')).toHaveClass('bg-amber-50');
  });

  it('renders status dot when dot prop is true', () => {
    const { container } = render(<Badge dot>Live</Badge>);
    expect(container.querySelector('.animate-ping')).toBeInTheDocument();
  });

  it('renders upward and downward trend icons', () => {
    const { rerender } = render(<Badge trend="up">+12%</Badge>);
    expect(screen.getByTestId('trend-up')).toBeInTheDocument();

    rerender(<Badge trend="down">-5%</Badge>);
    expect(screen.getByTestId('trend-down')).toBeInTheDocument();
  });
});
