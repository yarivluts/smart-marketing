import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from './label';

describe('Label', () => {
  it('renders label text and optional required asterisk', () => {
    render(<Label required htmlFor="email">Email Address</Label>);
    expect(screen.getByText('Email Address')).toBeInTheDocument();
    expect(screen.getByText('*')).toHaveClass('text-destructive');
  });
});
