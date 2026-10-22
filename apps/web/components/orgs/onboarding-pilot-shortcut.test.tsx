import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnboardingPilotShortcut } from './onboarding-pilot-shortcut';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('OnboardingPilotShortcut', () => {
  it('offers Growth Pilot as the no-setup way in', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <OnboardingPilotShortcut orgId="org-1" projectId="project-1" />
      </NextIntlClientProvider>,
    );
    const link = screen.getByRole('link', { name: 'Let the AI do it for me' });
    expect(link).toHaveAttribute('href', '/orgs/org-1/projects/project-1/growth-pilot');
    expect(screen.getByText(/reads your website/i)).toBeInTheDocument();
  });

  it('has Hebrew copy for every line', () => {
    const keys = ['pilotShortcutTitle', 'pilotShortcutBody', 'pilotShortcutButton'] as const;
    for (const key of keys) {
      expect(en.Onboarding[key]).toBeTruthy();
      expect(he.Onboarding[key]).toBeTruthy();
      expect(he.Onboarding[key]).not.toBe(en.Onboarding[key]);
    }
  });
});
