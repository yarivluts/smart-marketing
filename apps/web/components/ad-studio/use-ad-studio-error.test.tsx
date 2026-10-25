import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { useAdStudioErrorMessage } from './use-ad-studio-error';

function Message({ error }: { error: string }): React.ReactElement {
  const errorMessage = useAdStudioErrorMessage();
  return <p role="alert">{errorMessage({ error })}</p>;
}

describe('useAdStudioErrorMessage', () => {
  it.each([
    ['en', 'unauthenticated', enMessages.AdStudio.errorSignedOut],
    ['he', 'unauthenticated', heMessages.AdStudio.errorSignedOut],
    ['en', 'forbidden', enMessages.AdStudio.errorForbidden],
    ['he', 'forbidden', heMessages.AdStudio.errorForbidden],
    ['en', 'not_found', enMessages.AdStudio.errorNotFound],
    ['he', 'not_found', heMessages.AdStudio.errorNotFound],
  ] as const)('%s: %s says what to do, not "check your internet connection"', (locale, error, text) => {
    renderWithIntl(<Message error={error} />, { locale });
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('alert')).not.toHaveTextContent(locale === 'en' ? enMessages.AdStudio.errorGeneric : heMessages.AdStudio.errorGeneric);
  });

  it('keeps the generic sentence for anything unknown', () => {
    renderWithIntl(<Message error="boom" />, { locale: 'en' });
    expect(screen.getByRole('alert')).toHaveTextContent(enMessages.AdStudio.errorGeneric);
  });
});
