import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Gauge, Radio } from 'lucide-react';
import { PackSetupLanding } from './pack-setup-landing';
import messages from '../../messages/en.json';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe('PackSetupLanding', () => {
  it('opens on the page hero, describes what the page will chart, and offers the one-click install', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PackSetupLanding
          orgId="org-1"
          projectId="project-1"
          icon={Gauge}
          eyebrow="Signup quality"
          title="Intent & quality for Client Delta"
          intro="Install the pack to start."
          featuresTitle="What this page shows"
          installTitle="Install the pack"
          packs={[{ pluginId: 'com.growthos.quality-score-pack' }]}
          features={[
            { key: 'tiers', icon: Gauge, title: 'Quality tiers', description: 'Low, medium and high.' },
            { key: 'channels', icon: Radio, title: 'By channel', description: 'Average score per channel.' },
          ]}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Intent & quality for Client Delta' })).toBeInTheDocument();
    expect(screen.getByText('Install the pack to start.')).toBeInTheDocument();
    const features = screen.getAllByTestId('pack-setup-feature');
    expect(features).toHaveLength(2);
    expect(within(features[0]).getByText('Quality tiers')).toBeInTheDocument();
    expect(within(features[1]).getByText('Average score per channel.')).toBeInTheDocument();
    // The preview never shows numbers - only the real install card, which still installs via its button.
    expect(screen.getByRole('heading', { name: 'Install the pack' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Install/ })).toBeInTheDocument();
  });
});
