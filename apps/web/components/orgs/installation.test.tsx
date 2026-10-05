import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { InstallationReport } from '@growthos/shared';
import messages from '../../messages/en.json';
import { InstallationCheck } from './installation-check';
import { InstallationCode } from './installation-code';

const REPORT: InstallationReport = {
  status: 'attention',
  schemas: [
    {
      name: 'touchpoint',
      kind: 'event',
      status: 'receiving',
      registered: true,
      lastAcceptedAt: '2026-10-05T11:00:00Z',
      openQuarantined: 0,
      quarantineReasons: [],
      fix: null,
    },
    {
      name: 'signup',
      kind: 'event',
      status: 'quarantined',
      registered: true,
      lastAcceptedAt: null,
      openQuarantined: 2,
      quarantineReasons: ['missing_required_field:plan'],
      fix: 'Every "signup" record was rejected.',
    },
  ],
};

function renderWith(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('InstallationCheck', () => {
  it('shows each schema with its status, reasons and fix', () => {
    renderWith(
      <InstallationCheck
        orgId="o"
        projectId="p"
        environmentId="env-prod"
        environmentName="prod"
        defaultExpected={['touchpoint', 'signup']}
        initialReport={REPORT}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Something needs attention in prod.');
    const signup = screen.getByTestId('installation-schema-signup');
    expect(signup).toHaveAttribute('data-status', 'quarantined');
    expect(within(signup).getByText('Rejected')).toBeInTheDocument();
    expect(within(signup).getByText('missing_required_field:plan')).toBeInTheDocument();
    expect(within(signup).getByText('Every "signup" record was rejected.')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('installation-schema-touchpoint')).getByText('Receiving'),
    ).toBeInTheDocument();
  });

  it('listens live: re-checks every few seconds for the expected names, until stopped', async () => {
    vi.useFakeTimers();
    const ok: InstallationReport = {
      status: 'ok',
      schemas: [
        { ...REPORT.schemas[0] },
        {
          ...REPORT.schemas[1],
          status: 'receiving',
          openQuarantined: 0,
          quarantineReasons: [],
          fix: null,
          lastAcceptedAt: '2026-10-05T11:01:00Z',
        },
      ],
    };
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ report: ok }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWith(
      <InstallationCheck
        orgId="o"
        projectId="p"
        environmentId="env-prod"
        environmentName="prod"
        defaultExpected={['touchpoint', 'signup']}
        initialReport={REPORT}
      />,
    );
    fireEvent.change(screen.getByLabelText('Schema name, e.g. signup'), {
      target: { value: 'customer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Check it too/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Listen live/ }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      '/api/orgs/o/projects/p/installation?environmentId=env-prod&expect=touchpoint%2Csignup%2Ccustomer',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Everything expected is arriving in prod.',
    );
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Stop listening/ }));
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('says so when the check cannot run', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    renderWith(
      <InstallationCheck
        orgId="o"
        projectId="p"
        environmentId="env-prod"
        environmentName="prod"
        defaultExpected={[]}
        initialReport={{ status: 'attention', schemas: [] }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't run the check"),
    );
  });
});

describe('InstallationCode', () => {
  it('fills in the addresses and the key, for every way of connecting', () => {
    renderWith(
      <InstallationCode
        apiBase="https://api.test"
        browserKeyPrefix="gos_pk_live_ab12cd34"
        serverKeyPrefix="gos_live_ef56"
      />,
    );
    const code = () =>
      screen.getByTestId('installation-code').querySelector('pre code')?.textContent ?? '';
    expect(code()).toContain(
      'GrowthOS.init({"key":"gos_pk_live_ab12cd34...","api":"https://api.test"});',
    );
    expect(code()).toContain(`${window.location.origin}/sdk/v1/growthos.js`);
    expect(screen.getByText(/Replace the shortened key/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Node.js server' }));
    expect(code()).toContain(`npm install ${window.location.origin}/sdk/v1/growthos-node.tgz`);
    expect(code()).toContain("baseUrl: 'https://api.test'");
    fireEvent.click(screen.getByRole('tab', { name: 'Relay (strict CSP)' }));
    expect(code()).toContain('createRelayHandler');
    fireEvent.click(screen.getByRole('tab', { name: 'Check from code' }));
    expect(code()).toContain(
      'GROWTHOS_API_KEY=gos_live_ef56... npx growthos verify --base-url https://api.test',
    );
  });

  it('shows placeholders when the environment has no keys yet', () => {
    renderWith(
      <InstallationCode
        apiBase="https://api.test"
        browserKeyPrefix={null}
        serverKeyPrefix={null}
      />,
    );
    expect(screen.getByTestId('installation-code').textContent).toContain(
      '"key":"gos_pk_live_..."',
    );
  });
});
