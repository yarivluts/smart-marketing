import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { OrgMemberSummary } from '@growthos/firebase-orm-models';
import { MembersList } from './members-list';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let locale = 'en';
vi.mock('next-intl/server', async () => {
  const intl = await import('next-intl');
  return {
    getTranslations: async (ns: string) => {
      const messages = (locale === 'he' ? he : en) as Record<string, unknown>;
      return intl.createTranslator({ locale, messages, namespace: ns as never });
    },
  };
});

function member(over: Partial<OrgMemberSummary>): OrgMemberSummary {
  return {
    membershipId: 'm1',
    userId: 'u1',
    email: 'a@example.com',
    displayName: 'A',
    role: 'viewer',
    status: 'invited',
    ...over,
  } as OrgMemberSummary;
}

async function show(l: string, members: OrgMemberSummary[], canManage = false): Promise<void> {
  locale = l;
  const ui = await MembersList({ orgId: 'o1', members, canManageMembers: canManage, projects: [] });
  const messages = (l === 'he' ? he : en) as Record<string, unknown>;
  render(<NextIntlClientProvider locale={l} messages={messages as never}>{ui}</NextIntlClientProvider>);
}

describe('MembersList', () => {
  it('shows plain role and status names, not internal ids', async () => {
    await show('en', [member({ role: 'ingest_only', status: 'invited' })]);
    expect(screen.getByText('Data sender only (Invited – waiting for them to accept)')).toBeInTheDocument();
    expect(screen.queryByText(/ingest_only/)).toBeNull();
  });

  it('shows Hebrew names on Hebrew pages', async () => {
    await show('he', [member({ role: 'org_owner', status: 'suspended' })]);
    expect(screen.getByText('בעלים (מושעה)')).toBeInTheDocument();
  });

  it('labels the role dropdown options with plain names', async () => {
    await show('en', [member({ role: 'org_admin', status: 'active' })], true);
    expect(screen.getByRole('option', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByText('(Active)')).toBeInTheDocument();
  });
});
