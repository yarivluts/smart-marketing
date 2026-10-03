import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpendProtectionConsole } from './spend-protection-console';

describe('SpendProtectionConsole', () => {
  it('renders the emergency kill switch and active guardrails cards', () => {
    render(<SpendProtectionConsole isDataConnected={true} />);

    expect(screen.getByTestId('spend-protection-console')).toBeDefined();
    expect(screen.getByText('Emergency Kill Switch')).toBeDefined();
    expect(screen.getByText('Active Guardrails')).toBeDefined();
    expect(screen.getByText('ROAS Floor Protection')).toBeDefined();
    expect(screen.getByText('Creative Fatigue Breaker')).toBeDefined();
    expect(screen.getByText('Landing Page Error Shield')).toBeDefined();
    expect(screen.getByText('Automated Safety Interventions Log')).toBeDefined();
  });

  it('triggers emergency kill switch confirmation flow', () => {
    const handleKillSwitch = vi.fn();
    render(
      <SpendProtectionConsole isDataConnected={true} onTriggerKillSwitch={handleKillSwitch} />
    );

    const haltBtn = screen.getByRole('button', { name: /Halt All Paid Traffic Now/i });
    fireEvent.click(haltBtn);

    expect(screen.getByText('Confirm Emergency Halt')).toBeDefined();
    const confirmBtn = screen.getByRole('button', { name: /Yes, Halt All Traffic/i });
    fireEvent.click(confirmBtn);

    expect(handleKillSwitch).toHaveBeenCalledWith(true);
    expect(screen.getByText('TRAFFIC HALTED')).toBeDefined();
  });

  it('toggles a guardrail rule on switch click', () => {
    const handleToggleRule = vi.fn();
    render(
      <SpendProtectionConsole isDataConnected={true} onToggleRule={handleToggleRule} />
    );

    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
    fireEvent.click(switches[0]);

    expect(handleToggleRule).toHaveBeenCalled();
  });

  it('renders missing integration overlay when ad data is missing', () => {
    render(
      <SpendProtectionConsole
        isDataConnected={false}
        missingConnectors={['google_ads', 'meta_ads']}
      />
    );

    expect(screen.getByTestId('missing-integration-overlay')).toBeDefined();
  });
});
