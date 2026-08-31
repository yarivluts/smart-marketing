import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    render(<Button variant="outline">Outlined</Button>);
    expect(screen.getByRole('button', { name: 'Outlined' })).toHaveClass('border');
  });

  it('applies emerald and success variant classes', () => {
    render(<Button variant="emerald">Emerald Action</Button>);
    expect(screen.getByRole('button', { name: 'Emerald Action' })).toHaveClass('bg-emerald-600');
  });

  it('renders loading state with spinner and disables button', () => {
    render(<Button isLoading>Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
  });

  it('renders icon button size correctly', () => {
    render(<Button size="icon" aria-label="Settings">⚙</Button>);
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveClass('h-10', 'w-10');
  });
});
