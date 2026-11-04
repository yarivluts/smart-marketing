import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OnboardingDoneNextStep } from './onboarding-done-next-step';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function view(locale: 'en' | 'he', canUsePilot: boolean): void {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : he}>
      <OnboardingDoneNextStep orgId="org-1" projectId="project-1" canUsePilot={canUsePilot} />
    </NextIntlClientProvider>,
  );
}

describe('OnboardingDoneNextStep', () => {
  it('points a finished newcomer at Growth Pilot', () => {
    view('en', true);
    expect(screen.getByText(en.Onboarding.doneMessage)).toBeTruthy();
    expect(screen.getByRole('link', { name: en.Onboarding.doneNextStepButton }).getAttribute('href')).toBe('/orgs/org-1/projects/project-1/growth-pilot');
  });

  it('shows no link to a page the person cannot open', () => {
    view('en', false);
    expect(screen.getByText(en.Onboarding.doneMessage)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('has Hebrew copy', () => {
    view('he', true);
    expect(he.Onboarding.doneNextStepBody.length).toBeGreaterThan(10);
    expect(screen.getByRole('link', { name: he.Onboarding.doneNextStepButton })).toBeTruthy();
  });
});
