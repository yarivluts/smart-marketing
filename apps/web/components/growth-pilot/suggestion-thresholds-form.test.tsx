import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { DEFAULT_GROWTH_SUGGESTION_THRESHOLDS } from '@growthos/shared';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import en from '@/messages/en.json';
import { fromField, SuggestionThresholdsForm, toField } from './suggestion-thresholds-form';

const words = en.GrowthPilot.settings;
const ENDPOINT = '/api/orgs/o/projects/p/growth-pilot/settings';
const PLATFORM = { ...DEFAULT_GROWTH_SUGGESTION_THRESHOLDS, noClicksAfterDays: 5 };

function stub(answer: { status?: number; body: unknown }) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sent = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([url, init]) => ({ url, method: (init as RequestInit).method, body: (init as RequestInit).body ? JSON.parse((init as RequestInit).body as string) : undefined }));

function render(overrides: Record<string, number> = {}, lastChangedOn: string | null = null) {
  return renderWithIntl(<SuggestionThresholdsForm endpoint={ENDPOINT} scope="project" initial={{ overrides, defaults: PLATFORM, lastChangedOn }} />, { locale: 'en' });
}

afterEach(() => vi.unstubAllGlobals());

describe('SuggestionThresholdsForm', () => {
  it('shows each threshold with its default and range, rates as percentages', () => {
    stub({ body: {} });
    render({ lowCtr: 0.012 });
    expect(screen.getByTestId('growth-pilot-thresholds-state')).toHaveTextContent(words.usingDefaults);
    const ctr = screen.getByTestId('growth-pilot-threshold-lowCtr');
    expect(ctr).toHaveValue(1.2);
    expect(screen.getByTestId('growth-pilot-threshold-noClicksAfterDays')).toHaveValue(null);
    expect(screen.getByTestId('growth-pilot-threshold-noClicksAfterDays')).toHaveAttribute('placeholder', '5');
    expect(screen.getByText(new RegExp(`${words.fields.noClicksAfterDays.help}.*Default: 5`))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${words.fields.lowCtr.help}.*From 0 to 100`))).toBeInTheDocument();
  });

  it('saves only the fields that are filled, converting percentages back', async () => {
    const fetchMock = stub({ body: { settings: { overrides: { lowCtr: 0.02, noClicksAfterDays: 4 }, lastChangedOn: '2026-11-08T10:00:00.000Z' } } });
    render();
    fireEvent.change(screen.getByTestId('growth-pilot-threshold-lowCtr'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('growth-pilot-threshold-noClicksAfterDays'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('growth-pilot-thresholds-save'));
    await waitFor(() => expect(sent(fetchMock)).toEqual([{ url: ENDPOINT, method: 'PUT', body: { thresholds: { noClicksAfterDays: 4, lowCtr: 0.02 } } }]));
    expect(await screen.findByTestId('growth-pilot-thresholds-status')).toHaveTextContent(words.saved);
    expect(screen.getByTestId('growth-pilot-thresholds-state')).toHaveTextContent('This project has its own values.');
  });

  it('refuses out-of-range values before sending anything, and marks them', () => {
    const fetchMock = stub({ body: {} });
    render();
    fireEvent.change(screen.getByTestId('growth-pilot-threshold-noClicksAfterDays'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('growth-pilot-threshold-lowCtr'), { target: { value: '150' } });
    fireEvent.click(screen.getByTestId('growth-pilot-thresholds-save'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('growth-pilot-thresholds-status')).toHaveTextContent(words.invalid);
    expect(screen.getByTestId('growth-pilot-threshold-noClicksAfterDays')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('growth-pilot-threshold-lowCtr')).toHaveAttribute('aria-invalid', 'true');
  });

  it('resets to the defaults, and says when the server refuses', async () => {
    const fetchMock = stub({ body: { settings: { overrides: {}, lastChangedOn: null } } });
    render({ lowCtr: 0.02 }, '2026-11-01T10:00:00.000Z');
    fireEvent.click(screen.getByTestId('growth-pilot-thresholds-reset'));
    await waitFor(() => expect(sent(fetchMock)).toEqual([{ url: ENDPOINT, method: 'DELETE', body: undefined }]));
    expect(await screen.findByTestId('growth-pilot-thresholds-status')).toHaveTextContent(words.resetDone);
    expect(screen.getByTestId('growth-pilot-threshold-lowCtr')).toHaveValue(null);
    expect(screen.getByTestId('growth-pilot-thresholds-reset')).toBeDisabled();

    stub({ status: 400, body: { error: 'invalid_thresholds', invalid: ['lowCtr'] } });
    fireEvent.change(screen.getByTestId('growth-pilot-threshold-lowCtr'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('growth-pilot-thresholds-save'));
    expect(await screen.findByTestId('growth-pilot-thresholds-status')).toHaveTextContent(words.invalid);
  });

  it('converts between the stored values and the fields', () => {
    expect(toField('lowCtr', 0.015)).toBe('1.5');
    expect(toField('noClicksAfterDays', 3)).toBe('3');
    expect(fromField('lowCtr', '1.5')).toBe(0.015);
    expect(fromField('lowCtr', '')).toBeNull();
    expect(fromField('noClicksAfterDays', 'x')).toBeNaN();
  });
});
