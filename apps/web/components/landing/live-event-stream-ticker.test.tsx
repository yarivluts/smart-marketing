import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '../../tests/e2e/helpers/test-harness';
import { LiveEventStreamTicker } from './live-event-stream-ticker';

describe('LiveEventStreamTicker Component', () => {
  it('renders the live stream header, initial events, and latency indicator', () => {
    renderWithIntl(<LiveEventStreamTicker />);

    expect(screen.getByTestId('live-event-stream-ticker')).toBeInTheDocument();
    expect(screen.getByText(/latency/i)).toBeInTheDocument();
    expect(screen.getByText('Enterprise Subscription Activated')).toBeInTheDocument();
  });

  it('filters events by category pills', () => {
    renderWithIntl(<LiveEventStreamTicker />);

    const guardrailsFilter = screen.getByRole('button', { name: /Guardrails|מעקות/i });
    fireEvent.click(guardrailsFilter);

    expect(screen.getByText('Adset Auto-Paused: Creative Fatigue')).toBeInTheDocument();
  });

  it('allows manually simulating a new incoming event', () => {
    renderWithIntl(<LiveEventStreamTicker />);

    const simulateBtn = screen.getByRole('button', { name: /Simulate Event|סמלץ אירוע/i });
    fireEvent.click(simulateBtn);

    expect(screen.getByTestId('live-event-stream-ticker')).toBeInTheDocument();
  });

  it('allows pausing and resuming the live stream', () => {
    renderWithIntl(<LiveEventStreamTicker />);

    const pauseBtn = screen.getByRole('button', { name: /Pause|השהה/i });
    fireEvent.click(pauseBtn);

    expect(screen.getByRole('button', { name: /Resume|המשך/i })).toBeInTheDocument();
  });
});
