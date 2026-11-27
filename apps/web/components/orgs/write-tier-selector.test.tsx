import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  describe('when the change does not go through', () => {
    afterEach(() => vi.unstubAllGlobals());

    function setup(): void {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <WriteTierSelector orgId="org-1" attachmentId="a-1" tier="read" />
        </NextIntlClientProvider>,
      );
    }

    it('says nothing was changed when the connection drops', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      setup();
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'manage' } });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Nothing was changed');
      expect(alert).toHaveTextContent('internet connection');
      await waitFor(() => expect(screen.getByRole('combobox')).not.toBeDisabled());
      expect(screen.getByRole('combobox')).toHaveValue('read');
    });

    it('says the same when the server refuses', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      setup();
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'optimize' } });
      expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was changed');
    });

    it('has the Hebrew message say nothing changed', () => {
      expect(heMessages.ProjectResources.writeTierError).toContain('שום דבר לא השתנה');
    });
  });
});
