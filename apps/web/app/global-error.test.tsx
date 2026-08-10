import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import * as Sentry from '@sentry/nextjs';
import GlobalError from './global-error';

describe('GlobalError', () => {
  it('reports the error to Sentry', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });

    render(<GlobalError error={error} />);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
