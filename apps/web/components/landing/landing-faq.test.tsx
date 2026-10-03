import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { LandingFaq } from './landing-faq';

describe('LandingFaq Component', () => {
  it('renders FAQ questions and search bar', () => {
    renderWithIntl(<LandingFaq />);

    expect(screen.getByTestId('landing-faq')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search questions/i)).toBeInTheDocument();
  });

  it('filters questions by search query', () => {
    renderWithIntl(<LandingFaq />);

    const searchInput = screen.getByPlaceholderText(/Search questions/i);
    fireEvent.change(searchInput, { target: { value: 'Snowflake' } });

    expect(screen.getByText(/BigQuery or Snowflake/i)).toBeInTheDocument();
  });

  it('toggles accordion answer on question click', () => {
    renderWithIntl(<LandingFaq />);

    const questionBtn = screen.getByText(/autonomous Cost Guardrail kill-switch work/i);
    fireEvent.click(questionBtn);

    expect(screen.getByText(/CPA.*CTR/i)).toBeInTheDocument();
  });
});
