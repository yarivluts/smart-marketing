import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { TouchpointSnippetDisplay } from './touchpoint-snippet-display';
import en from '../../messages/en.json';
import he from '../../messages/he.json';

describe('TouchpointSnippetDisplay intro', () => {
  it('explains in plain words what the snippet records', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <TouchpointSnippetDisplay writeKey="k" ingestBaseUrl="https://api.example.com/v1/ingest" />
      </NextIntlClientProvider>,
    );
    const intro = screen.getByText(/notes where each visitor came from/);
    expect(intro.textContent).not.toMatch(/touchpoint|ad click id|landing page/i);
  });

  it('keeps jargon out of both languages', () => {
    for (const messages of [en, he]) {
      expect(messages.ApiKeys.touchpointSnippetIntro).not.toMatch(/touchpoint|landing page|נחיתה|קמפיין/i);
    }
  });
});
