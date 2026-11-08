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

  it.each([
    ['en', enMessages.AdStudio],
    ['he', heMessages.AdStudio],
  ] as const)('%s: a rejected ad form names the field in plain words, not the server sentence', (locale, studio) => {
    function Invalid(): React.ReactElement {
      const errorMessage = useAdStudioErrorMessage();
      return (
        <p role="alert">
          {errorMessage({ error: 'invalid_brief', reasons: ['name must be 1-120 characters', 'landingPageUrl must be an http(s) URL', 'dailyImages must be a whole number from 0 to 50', 'mystery'] })}
        </p>
      );
    }
    renderWithIntl(<Invalid />, { locale });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(studio.briefIssues.name);
    expect(alert).toHaveTextContent(studio.briefIssues.landingPageUrl);
    expect(alert).toHaveTextContent(studio.briefIssues.limits);
    expect(alert).toHaveTextContent(studio.briefIssues.unknown);
    expect(alert).not.toHaveTextContent(/must be|http\(s\)|from 0 to|landingPageUrl|dailyImages/);
  });

  it.each([
    ['en', enMessages.AdStudio],
    ['he', heMessages.AdStudio],
  ] as const)('%s: the daily video limit is counted in seconds, not as the AI text allowance', (locale, studio) => {
    function Quota({ kind }: { kind: 'text' | 'video' | 'image' }): React.ReactElement {
      const errorMessage = useAdStudioErrorMessage();
      return <p role="alert">{errorMessage({ error: 'quota_exceeded', limitKind: kind, used: 60, limit: 60 })}</p>;
    }
    const { unmount } = renderWithIntl(<Quota kind="video" />, { locale });
    expect(screen.getByRole('alert').textContent).toBe(studio.videoQuotaExceeded.replace('{used}', '60').replace('{limit}', '60'));
    unmount();
    renderWithIntl(<Quota kind="text" />, { locale });
    expect(screen.getByRole('alert').textContent).toBe(studio.quotaExceeded.replace('{used}', '60').replace('{limit}', '60'));
  });
});
