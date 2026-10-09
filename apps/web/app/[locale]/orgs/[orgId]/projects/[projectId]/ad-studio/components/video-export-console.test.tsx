import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import { VideoExportConsole } from './video-export-console';
import { getBaselineVideoExportTelemetry, type VideoExportTelemetryResult } from '@growthos/shared';

describe('VideoExportConsole Component', () => {
  const orgId = 'org-test-101';
  const projectId = 'proj-test-202';
  const projectName = 'Quantum_Launch_Campaign_v1';

  let mockTelemetry: VideoExportTelemetryResult;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTelemetry = getBaselineVideoExportTelemetry(projectName);

    // Default fetch mock
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      if (body.action === 'render') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              job: {
                id: 'JOB-7788',
                rendition_format: 'Meta Reels 9:16 H.265 Master',
                format: 'Meta Reels 9:16 H.265 Master',
                resolution: '1080x1920',
                duration: '00:30',
                file_size_bytes: 148897792,
                file_size_formatted: '142 MB',
                codec: 'H.265',
                container: 'mp4',
                status: 'ready',
                download_url: 'https://storage.googleapis.com/growthos-ad-renders/org-test-101/JOB-7788.mp4',
                cdn_url: 'https://cdn.growthos.io/renders/JOB-7788.mp4',
              },
              message: 'Render job JOB-7788 compiled and stitched successfully to Cloud Storage.',
            }),
        });
      }

      if (body.action === 'dispatch') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              message: 'Assets successfully dispatched to Meta & Google Ads Vaults.',
            }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    });
  });

  it('renders Master Render Canvas with badges, resolutions, and active projection pills', () => {
    renderWithIntl(
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    // Console Ribbon Header
    expect(screen.getByText('Video Assembly & Export Console')).toBeInTheDocument();
    expect(screen.getByText(/NVIDIA L4 Cloud Worker/i)).toBeInTheDocument();

    // Master Render Canvas Card
    expect(screen.getByText('Master Render Canvas')).toBeInTheDocument();
    expect(screen.getByText('Quantum_Launch_Campaign_v1_ProRes422.mov')).toBeInTheDocument();
    expect(screen.getByText(/4K \(3840x2160\) 60 FPS/i)).toBeInTheDocument();
    expect(screen.getByText('Dolby Vision / HDR10')).toBeInTheDocument();

    // Projection Pills
    expect(screen.getByRole('button', { name: '9:16' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1:1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '16:9' })).toBeInTheDocument();
  });

  it('renders Audio Conformance Card with EBU R128 status, LUFS target, and waveform bars', () => {
    renderWithIntl(
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    expect(screen.getByText(/Audio Conformance & Loudness Target \(-14 LUFS\)/i)).toBeInTheDocument();
    expect(screen.getByText('Passed EBU R128')).toBeInTheDocument();
  });

  it('renders 4 Channel Target Conformance cards with specifications and platform badges', () => {
    renderWithIntl(
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    expect(screen.getByText('Channel Target Conformance')).toBeInTheDocument();
    expect(screen.getByText('Meta Reels')).toBeInTheDocument();
    expect(screen.getByText('TikTok Spark')).toBeInTheDocument();
    expect(screen.getByText('YouTube Shorts')).toBeInTheDocument();
    expect(screen.getByText('Google Ads PMax')).toBeInTheDocument();
    expect(screen.getAllByText('Optimized').length).toBe(3);
    expect(screen.getByText('Reviewing')).toBeInTheDocument();
  });

  it('switches canvas projection aspect ratios (9:16, 1:1, 16:9)', () => {
    renderWithIntl(
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    // Initial 9:16 projection
    expect(screen.getAllByText('9:16').length).toBeGreaterThan(0);

    // Switch to 1:1
    const squarePill = screen.getByRole('button', { name: '1:1' });
    fireEvent.click(squarePill);
    expect(screen.getAllByText('1:1').length).toBeGreaterThan(0);

    // Switch to 16:9
    const landscapePill = screen.getByRole('button', { name: '16:9' });
    fireEvent.click(landscapePill);
    expect(screen.getAllByText('16:9').length).toBeGreaterThan(0);

    // Switch back to 9:16
    const verticalPill = screen.getByRole('button', { name: '9:16' });
    fireEvent.click(verticalPill);
    expect(screen.getAllByText('9:16').length).toBeGreaterThan(0);
  });

  it('toggles video player play/pause state', () => {
    renderWithIntl(
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    const playBtn = screen.getByRole('button', { name: 'Play video' });
    expect(playBtn).toBeInTheDocument();
    fireEvent.click(playBtn);

    const pauseBtn = screen.getByRole('button', { name: 'Pause video' });
    expect(pauseBtn).toBeInTheDocument();
    fireEvent.click(pauseBtn);

    expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument();
  });

  it('toggles export guardrails (dynamic audio ducking, captions burn-in, safe zones)', () => {
    renderWithIntl(
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    expect(screen.getByText('Metadata & Guardrails')).toBeInTheDocument();
    expect(screen.getByText('Brand Safety AI Pass')).toBeInTheDocument();

    const duckingToggle = screen.getByText('Dynamic Audio Ducking');
    fireEvent.click(duckingToggle);

    const captionsToggle = screen.getByText('Closed Captions Burn-in');
    fireEvent.click(captionsToggle);

    const safeZonesToggle = screen.getByText('Safe Zones Verification');
    fireEvent.click(safeZonesToggle);
  });

  it('triggers video assembly render job via POST /ad-studio/video-export and adds to queue', async () => {
    renderWithIntl(
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    const renderBtn = screen.getByRole('button', { name: /Start Video Assembly & Export/i });
    fireEvent.click(renderBtn);

    await waitFor(() => {
      expect(screen.getByTestId('video-export-feedback')).toBeInTheDocument();
      expect(
        screen.getByText('Render job JOB-7788 compiled and stitched successfully to Cloud Storage.'),
      ).toBeInTheDocument();
    });

    // Verify newly rendered job appears in the ledger
    expect(screen.getByText('JOB-7788')).toBeInTheDocument();
    expect(screen.getByText('Meta Reels 9:16 H.265 Master')).toBeInTheDocument();

    // Dismiss feedback
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtn);
    expect(screen.queryByTestId('video-export-feedback')).toBeNull();
  });

  it('triggers ad network dispatch via POST /ad-studio/video-export and marks renditions as synced', async () => {
    renderWithIntl(
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    const dispatchBtn = screen.getByRole('button', { name: /Push & Dispatch to Ad Networks/i });
    fireEvent.click(dispatchBtn);

    await waitFor(() => {
      expect(screen.getByTestId('video-export-feedback')).toBeInTheDocument();
      expect(
        screen.getByText('Assets successfully dispatched to Meta & Google Ads Vaults.'),
      ).toBeInTheDocument();
      expect(screen.getAllByText('CAPI Synced').length).toBeGreaterThan(0);
    });
  });

  it('copies CDN URL to clipboard with visual feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    renderWithIntl(
      <VideoExportConsole
        orgId={orgId}
        projectId={projectId}
        projectName={projectName}
        initialTelemetry={mockTelemetry}
      />,
    );

    const copyButtons = screen.getAllByRole('button', { name: /Copy CDN/i });
    expect(copyButtons.length).toBeGreaterThan(0);

    fireEvent.click(copyButtons[0]);

    expect(screen.getByText('Copied')).toBeInTheDocument();
    expect(writeTextMock).toHaveBeenCalledWith('https://cdn.growthos.io/media/exports/job-9401-master.mov');

    await waitFor(
      () => {
        expect(screen.queryByText('Copied')).toBeNull();
      },
      { timeout: 3000 },
    );
  });
});
