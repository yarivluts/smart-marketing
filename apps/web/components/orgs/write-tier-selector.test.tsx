import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { WriteTierSelector } from './write-tier-selector';
import messages from '../../messages/en.json';
import heMessages from '../../messages/he.json';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe('WriteTierSelector', () => {
  it('describes each access level in plain words instead of Read / Optimize / Manage', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <WriteTierSelector orgId="org-1" attachmentId="a-1" tier="read" />
      </NextIntlClientProvider>,
    );
    const select = screen.getByRole('combobox', { name: 'What GrowthOS may do with this account' });
    expect(select).toHaveValue('read');
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(labels).toEqual([
      'Look only - changes nothing',
      'Adjust budgets, pause or turn on ads',
      'Full control - also create and edit ads',
    ]);
  });

  it('has the same three plain options in Hebrew, without the word for "write tier"', () => {
    const he = heMessages.ProjectResources;
    expect(he.writeTierLabel).not.toContain('כתיבה');
    expect(he.writeTierOptimize).not.toContain('אופטימיזציה');
    expect(he.writeTierRead && he.writeTierManage && he.writeTierError).toBeTruthy();
  });
});
