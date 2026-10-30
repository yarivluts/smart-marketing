import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import * as Sentry from '@sentry/nextjs';
import en from '@/messages/en.json';
import he from '@/messages/he.json';
import GlobalError from './global-error';

describe('GlobalError', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it('reports the error to Sentry', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });

    render(<GlobalError error={error} />);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('shows a plain message with retry and a way back, not the framework screen', () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error('boom')} reset={reset} />);

    expect(screen.getByRole('heading', { name: en.ErrorPage.title })).toBeTruthy();
    expect(screen.queryByText(/Application error/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: en.ErrorPage.retry }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: en.ErrorPage.home }).getAttribute('href')).toBe('/en');
  });

  it('speaks Hebrew on Hebrew addresses', () => {
    window.history.pushState({}, '', '/he/orgs/1');
    render(<GlobalError error={new Error('boom')} reset={() => {}} />);

    expect(screen.getByRole('heading', { name: he.ErrorPage.title })).toBeTruthy();
    expect(screen.getByRole('link', { name: he.ErrorPage.home }).getAttribute('href')).toBe('/he');
  });
});
