import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { LandingHeader } from './landing-header';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'object' ? JSON.stringify(href) : href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/',
}));

describe('LandingHeader Component', () => {
  it('renders brand logo and locale switcher', () => {
    renderWithIntl(<LandingHeader />);

    expect(screen.getByText('GrowthOS')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Language/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders navigation links and action buttons', () => {
    renderWithIntl(<LandingHeader />);

    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('Architecture')).toBeInTheDocument();
    expect(screen.getByText('Solutions')).toBeInTheDocument();
    expect(screen.getByText('Start Free Workspace')).toBeInTheDocument();
  });

  it('toggles mobile drawer when hamburger button is clicked and closes on Escape', () => {
    renderWithIntl(<LandingHeader />);

    const menuButton = screen.getByRole('button', { name: /open menu/i });
    expect(menuButton).toBeInTheDocument();
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    // Open mobile menu
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /close menu/i })).toBeInTheDocument();

    // Verify drawer contents
    const startButtons = screen.getAllByText('Start Free Workspace');
    expect(startButtons.length).toBeGreaterThanOrEqual(2);

    // Press Escape to close
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');
  });
});
