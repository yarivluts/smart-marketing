import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders textarea with placeholder and allows input', () => {
    render(<Textarea placeholder="Enter campaign prompt..." />);
    expect(screen.getByPlaceholderText('Enter campaign prompt...')).toBeInTheDocument();
  });
});
