import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('renders its composed sections', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('applies the rounded, soft-shadow card styling by default', () => {
    render(<Card data-testid="card">content</Card>);
    expect(screen.getByTestId('card')).toHaveClass('rounded-2xl', 'shadow-soft');
  });

  it('merges a custom className rather than replacing the base styling', () => {
    render(
      <Card data-testid="card" className="p-4">
        content
      </Card>,
    );
    expect(screen.getByTestId('card')).toHaveClass('rounded-2xl', 'p-4');
  });

  it('applies its styling onto the child element itself when asChild is set, instead of wrapping it', () => {
    render(
      <Card asChild>
        <a href="/somewhere">link card</a>
      </Card>,
    );
    const link = screen.getByRole('link', { name: 'link card' });
    expect(link).toHaveClass('rounded-2xl', 'shadow-soft');
    expect(link.tagName).toBe('A');
  });
});
