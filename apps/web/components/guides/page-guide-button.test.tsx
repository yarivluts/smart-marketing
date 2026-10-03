import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { PageGuideButton } from './page-guide-button';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/orgs/org-1/projects/proj-1/campaigns',
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('PageGuideButton & PageGuideModal Component', () => {
  it('renders question mark trigger button with correct tooltip', () => {
    renderWithIntl(<PageGuideButton pageKey="campaigns" />, { locale: 'en' });

    const trigger = screen.getByTestId('page-guide-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-label', 'Page Guide & Marketing Terms');
  });

  it('opens guide modal upon clicking the question mark button and displays overview', () => {
    renderWithIntl(<PageGuideButton pageKey="campaigns" />, { locale: 'en' });

    const trigger = screen.getByTestId('page-guide-trigger');
    fireEvent.click(trigger);

    expect(screen.getByText('Ad Cockpit & Cross-Channel Campaigns')).toBeInTheDocument();
    expect(screen.getByText('Growth Guide for Beginners')).toBeInTheDocument();
    expect(screen.getByTestId('page-guide-tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('page-guide-tab-terms')).toBeInTheDocument();
    expect(screen.getByTestId('page-guide-tab-theory')).toBeInTheDocument();
    expect(screen.getByTestId('page-guide-tab-actions')).toBeInTheDocument();
  });

  it('switches to Terms & Glossary tab and displays marketing definitions and analogies', () => {
    renderWithIntl(<PageGuideButton pageKey="campaigns" />, { locale: 'en' });

    fireEvent.click(screen.getByTestId('page-guide-trigger'));
    fireEvent.click(screen.getByTestId('page-guide-tab-terms'));

    expect(screen.getByText('ROAS (Return On Ad Spend)')).toBeInTheDocument();
    expect(screen.getByText(/If you give an employee \$100 and they bring back \$400/)).toBeInTheDocument();
    expect(screen.getByText('Creative Fatigue')).toBeInTheDocument();
  });

  it('filters terms via the search input in the glossary tab', () => {
    renderWithIntl(<PageGuideButton pageKey="campaigns" />, { locale: 'en' });

    fireEvent.click(screen.getByTestId('page-guide-trigger'));
    fireEvent.click(screen.getByTestId('page-guide-tab-terms'));

    const searchInput = screen.getByTestId('page-guide-term-search');
    fireEvent.change(searchInput, { target: { value: 'Fatigue' } });

    expect(screen.getByText('Creative Fatigue')).toBeInTheDocument();
    expect(screen.queryByText('ROAS (Return On Ad Spend)')).not.toBeInTheDocument();
  });

  it('switches to Marketing Theory tab and displays economic principles and pitfalls', () => {
    renderWithIntl(<PageGuideButton pageKey="cohorts" />, { locale: 'en' });

    fireEvent.click(screen.getByTestId('page-guide-trigger'));
    fireEvent.click(screen.getByTestId('page-guide-tab-theory'));

    expect(screen.getByText('Economic Principles')).toBeInTheDocument();
    expect(screen.getByText('Common Mistakes to Avoid')).toBeInTheDocument();
    expect(screen.getByText(/Compound Net Retention/)).toBeInTheDocument();
  });

  it('switches to Action Playbook tab and displays daily routine and red flags', () => {
    renderWithIntl(<PageGuideButton pageKey="pulse" />, { locale: 'en' });

    fireEvent.click(screen.getByTestId('page-guide-trigger'));
    fireEvent.click(screen.getByTestId('page-guide-tab-actions'));

    expect(screen.getByText('What to Check')).toBeInTheDocument();
    expect(screen.getByText('Warning Signs & Red Flags')).toBeInTheDocument();
    expect(screen.getByText('Recommended Actions')).toBeInTheDocument();
  });

  it('supports full Hebrew RTL localization with simple analogies in Hebrew', () => {
    renderWithIntl(<PageGuideButton pageKey="pulse" />, { locale: 'he' });

    const trigger = screen.getByTestId('page-guide-trigger');
    expect(trigger).toHaveAttribute('aria-label', 'מדריך למסך ומונחי שיווק');

    fireEvent.click(trigger);

    expect(screen.getByText('דופק עסקי ומרכז בקרה ראשי')).toBeInTheDocument();
    expect(screen.getByText('מדריך צמיחה למתחילים')).toBeInTheDocument();

    // Check Hebrew terms tab
    fireEvent.click(screen.getByTestId('page-guide-tab-terms'));
    expect(screen.getByText('ROAS משוקלל (החזר על הוצאות פרסום)')).toBeInTheDocument();
    expect(screen.getByText(/אם הכנסת 100 ₪ למכונת חטיפים והיא הוציאה לך מוצרים בשווי 350 ₪/)).toBeInTheDocument();
  });

  it('triggers onAskCopilot callback when clicking Ask AI Copilot', () => {
    const onAskCopilot = vi.fn();
    renderWithIntl(<PageGuideButton pageKey="campaigns" onAskCopilot={onAskCopilot} />, { locale: 'en' });

    fireEvent.click(screen.getByTestId('page-guide-trigger'));
    const copilotBtn = screen.getByTestId('page-guide-ask-copilot-btn');
    fireEvent.click(copilotBtn);

    expect(onAskCopilot).toHaveBeenCalledWith(
      expect.stringContaining('creative fatigue'),
    );
  });

  it('closes modal when close button is clicked', async () => {
    renderWithIntl(<PageGuideButton pageKey="campaigns" />, { locale: 'en' });

    fireEvent.click(screen.getByTestId('page-guide-trigger'));
    expect(screen.getByText('Ad Cockpit & Cross-Channel Campaigns')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('page-guide-close-btn'));
    await waitFor(() => {
      expect(screen.queryByText('Ad Cockpit & Cross-Channel Campaigns')).not.toBeInTheDocument();
    });
  });

  it('resolves guide from pathname prop when pageKey is omitted', () => {
    renderWithIntl(<PageGuideButton pathname="/orgs/org-1/projects/proj-1/attribution" />, { locale: 'en' });

    fireEvent.click(screen.getByTestId('page-guide-trigger'));
    expect(screen.getByText('Multi-Touch Attribution Matrix')).toBeInTheDocument();
  });
});
