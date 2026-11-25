import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { DeleteBriefButton } from './delete-brief-button';

vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => vi.unstubAllGlobals());

describe('DeleteBriefButton failure', () => {
  for (const [locale, messages] of [['en', enMessages], ['he', heMessages]] as const) {
    it(`says the ad was not deleted when the connection fails (${locale})`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
      renderWithIntl(<DeleteBriefButton orgId="o" projectId="p" briefId="b" afterDeleteHref="/s" />, { locale });
      fireEvent.click(screen.getByRole('button', { name: messages.AdStudio.deleteAd }));
      fireEvent.click(screen.getAllByRole('button', { name: messages.AdStudio.deleteAd })[0]);
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(messages.AdStudio.deleteFailed));
    });
  }
});
