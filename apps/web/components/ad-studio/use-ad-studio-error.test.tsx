import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { useAdStudioErrorMessage, type AdStudioApiError } from './use-ad-studio-error';

function Message({ body }: { body: AdStudioApiError }): React.ReactElement {
  const errorMessage = useAdStudioErrorMessage();
  return <p>{errorMessage(body)}</p>;
}

describe('useAdStudioErrorMessage daily allowance', () => {
  it('counts video in seconds, not as "AI allowance"', () => {
    renderWithIntl(<Message body={{ error: 'quota_exceeded', limitKind: 'video', used: 60, limit: 60 }} />);
    const text = screen.getByText(/video allowance/).textContent ?? '';
    expect(text).toContain('60 of 60 seconds of video');
    expect(text).not.toContain('AI allowance');
  });

  it('keeps the text and picture wording', () => {
    const { unmount } = renderWithIntl(<Message body={{ error: 'quota_exceeded', limitKind: 'text', used: 5, limit: 5 }} />);
    expect(screen.getByText(/AI allowance \(5 of 5\)/)).toBeInTheDocument();
    unmount();
    renderWithIntl(<Message body={{ error: 'quota_exceeded', limitKind: 'image', used: 2, limit: 2 }} />);
    expect(screen.getByText(/picture allowance \(2 of 2\)/)).toBeInTheDocument();
  });
});
