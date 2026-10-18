import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StartOnboardingButton } from './start-onboarding-button';
import messages from '../../messages/en.json';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderButton(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StartOnboardingButton orgId="org-1" projectId="project-1" />
    </NextIntlClientProvider>,
  );
}

describe('StartOnboardingButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('POSTs to start the wizard and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ state: { step: 'pack' } }) } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Start onboarding' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith('/api/orgs/org-1/projects/project-1/onboarding', { method: 'POST' });
  });

  it('offers Growth Pilot as a way to skip the technical setup', () => {
    renderButton();

    expect(screen.getByRole('link', { name: 'Skip this and use Growth Pilot' })).toHaveAttribute('href', '/orgs/org-1/projects/project-1/growth-pilot');
  });

  it('shows an inline error when starting fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Start onboarding' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not save this step. Check your internet connection and try again - your earlier steps are kept.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
