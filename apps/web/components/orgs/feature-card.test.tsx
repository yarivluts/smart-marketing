import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutGrid } from 'lucide-react';
import { FeatureCard } from './feature-card';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'string' ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

describe('FeatureCard', () => {
  it('renders title, description, badge, and link correctly', () => {
    render(
      <FeatureCard
        title="Analytics Boards"
        description="Visual metric dashboards and funnel graphs."
        icon={LayoutGrid}
        href="/orgs/org-1/projects/p-1/boards"
        badge="Analytics"
        actionLabel="Open"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Analytics Boards' })).toBeInTheDocument();
    expect(screen.getByText('Visual metric dashboards and funnel graphs.')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/orgs/org-1/projects/p-1/boards');
  });
});
