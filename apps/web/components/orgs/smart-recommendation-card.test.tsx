import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { renderWithIntl, createMockCopilotProposal } from '@/tests/e2e/helpers/test-harness';
import { SmartRecommendationCard } from './smart-recommendation-card';
import en from '@/messages/en.json';
import he from '@/messages/he.json';

function renderCard(onApprove: () => Promise<void>, locale: 'en' | 'he') {
  renderWithIntl(
    <SmartRecommendationCard
      id="rec-1"
      category="budget"
      title="Scale budget"
      description="Increase the daily budget."
      beforeDiff="$150/day"
      afterDiff="$250/day"
      projectedImpact="+28%"
      actionProposal={createMockCopilotProposal()}
      onApprove={onApprove}
      onDismiss={vi.fn()}
    />,
    { locale },
  );
}

describe('SmartRecommendationCard approve failure', () => {
  it.each([
    ['en', en.Automation.approveError],
    ['he', he.Automation.approveError],
  ] as const)('shows a plain message, never the server code (%s)', async (locale, message) => {
    renderCard(() => Promise.reject(new Error('guardrail_violation')), locale);
    fireEvent.click(screen.getByTestId('smart-card-approve'));
    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument());
    expect(screen.queryByText(/guardrail_violation/)).not.toBeInTheDocument();
  });
});
