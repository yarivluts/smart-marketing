import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { InteractiveExperimentLab } from './interactive-experiment-lab';

describe('InteractiveExperimentLab Component', () => {
  it('renders experiment window, persona selectors, and Bayesian stats strip', () => {
    renderWithIntl(<InteractiveExperimentLab />);

    expect(screen.getByTestId('interactive-experiment-lab')).toBeInTheDocument();
    expect(screen.getByText('Eliminate Wasted Ad Spend with Unified Revenue Attribution')).toBeInTheDocument();
    expect(screen.getByText(/\+28\.4%/)).toBeInTheDocument();
  });

  it('switches persona variant on click and updates preview copy', () => {
    renderWithIntl(<InteractiveExperimentLab />);

    const ecomBtn = screen.getByRole('button', { name: /D2C E-Commerce/i });
    fireEvent.click(ecomBtn);

    expect(screen.getByText(/Scale Meta & TikTok ROAS with Real-Time Server CAPI/i)).toBeInTheDocument();
  });

  it('toggles between visual preview and edge patch code view', () => {
    renderWithIntl(<InteractiveExperimentLab />);

    const codeTab = screen.getByRole('button', { name: /Inspect Edge Patch|בחינת פאץ/i });
    fireEvent.click(codeTab);

    expect(screen.getByText(/Cloudflare Worker Edge Patch/i)).toBeInTheDocument();
  });
});
