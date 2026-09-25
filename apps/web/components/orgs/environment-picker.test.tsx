import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EnvironmentPicker } from './environment-picker';

const refresh = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const baseProps = {
  projectId: 'proj-1',
  options: ['dev', 'staging', 'prod'] as const,
  label: 'Environment',
  optionLabels: { dev: 'Dev', staging: 'Staging', prod: 'Prod' },
  nonProdNotice: 'Showing test data, not production.',
};

function clearCookie(): void {
  document.cookie = 'gos_env_proj-1=; Path=/; Max-Age=0';
}

describe('EnvironmentPicker', () => {
  beforeEach(() => {
    refresh.mockClear();
    clearCookie();
  });

  afterEach(clearCookie);

  it('renders one radio per environment and marks the current one checked', () => {
    render(<EnvironmentPicker {...baseProps} current="prod" />);

    const group = screen.getByRole('radiogroup', { name: 'Environment' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Dev', 'Staging', 'Prod']);
    expect(screen.getByRole('radio', { name: 'Prod' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dev' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows no non-prod notice while prod is selected', () => {
    render(<EnvironmentPicker {...baseProps} current="prod" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('flags a non-prod selection with a visible notice and a non-prod colour', () => {
    render(<EnvironmentPicker {...baseProps} current="dev" />);

    expect(screen.getByRole('status')).toHaveTextContent('Showing test data, not production.');
    expect(screen.getByRole('radio', { name: 'Dev' }).className).toContain('bg-purple-600');
  });

  it('writes the per-project cookie and refreshes the route when another environment is picked', () => {
    render(<EnvironmentPicker {...baseProps} current="prod" />);

    fireEvent.click(screen.getByRole('radio', { name: 'Dev' }));

    expect(document.cookie).toContain('gos_env_proj-1=dev');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the already-selected environment is clicked again', () => {
    render(<EnvironmentPicker {...baseProps} current="prod" />);

    fireEvent.click(screen.getByRole('radio', { name: 'Prod' }));

    expect(document.cookie).not.toContain('gos_env_proj-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders nothing for a project with no environments', () => {
    const { container } = render(<EnvironmentPicker {...baseProps} options={[]} current={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
