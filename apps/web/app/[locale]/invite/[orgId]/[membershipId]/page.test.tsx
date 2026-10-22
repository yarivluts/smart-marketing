import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import en from '../../../../../messages/en.json';
import he from '../../../../../messages/he.json';

vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => (en.Invite as Record<string, string>)[key] ?? key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('@/lib/orgs/queries', () => ({
  getInviteDetails: async () => ({ status: 'accepted', organizationName: 'Acme', inviteeEmail: 'a@b.co' }),
}));
vi.mock('@/lib/auth/get-server-session', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/orgs/session-context', () => ({ resolveOrgSessionContext: vi.fn() }));
vi.mock('@/components/orgs/accept-invite-button', () => ({ AcceptInviteButton: () => null }));
vi.mock('@/components/orgs/switch-account-button', () => ({ SwitchAccountButton: () => null }));

import InvitePage from './page';

describe('InvitePage for an invite that was already used', () => {
  it('tells the person what to do next instead of stopping', async () => {
    const ui = await InvitePage({
      params: Promise.resolve({ locale: 'en', orgId: 'o1', membershipId: 'm1' }),
    });
    render(ui);
    expect(screen.getByText(/already been used/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open GrowthOS' }).getAttribute('href')).toBe('/');
  });

  it('has the same wording in Hebrew without gendered "you"', () => {
    expect(he.Invite.openGrowthOs).toBeTruthy();
    expect(he.Invite.emailMismatch).not.toContain('אתה');
    expect(he.Invite.switchAccount).not.toContain('התנתק ');
  });
});
