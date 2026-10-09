import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from './e2e/helpers/test-harness';

// Mock server and navigation dependencies
const mockRedirect = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT:${url}`);
  (err as any).digest = `NEXT_REDIRECT;${url}`;
  throw err;
});

const mockNotFound = vi.fn(() => {
  const err = new Error('NEXT_NOT_FOUND');
  (err as any).digest = 'NEXT_NOT_FOUND';
  throw err;
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => mockNotFound(),
  usePathname: () => '/orgs/org-alpha/projects/proj-beta/ad-studio',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: any; children: React.ReactNode }) => (
    <a href={typeof href === 'object' ? JSON.stringify(href) : href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/orgs/org-alpha/projects/proj-beta/ad-studio',
}));

const mockSetRequestLocale = vi.fn();
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale?: string; namespace?: string } = {}) => {
    return (key: string) => `${namespace ?? 'root'}.${key}`;
  },
  setRequestLocale: (...args: any[]) => mockSetRequestLocale(...args),
}));

const mockGetServerSession = vi.fn();
const mockResolveOrgSessionContext = vi.fn();
const mockFindActiveMembership = vi.fn();
const mockListOrgProjects = vi.fn();

vi.mock('@/lib/auth/get-server-session', () => ({
  getServerSession: () => mockGetServerSession(),
}));

vi.mock('@/lib/orgs/session-context', () => ({
  resolveOrgSessionContext: (...args: any[]) => mockResolveOrgSessionContext(...args),
}));

vi.mock('@/lib/orgs/access', () => ({
  findActiveMembership: (...args: any[]) => mockFindActiveMembership(...args),
}));

const mockGetVideoExportTelemetryForProject = vi.fn().mockResolvedValue(null);
const mockGetAutopilotTelemetryForProject = vi.fn().mockResolvedValue(null);

vi.mock('@/lib/orgs/queries', () => ({
  listOrgProjects: (...args: any[]) => mockListOrgProjects(...args),
  getVideoExportTelemetryForProject: (...args: any[]) => mockGetVideoExportTelemetryForProject(...args),
  getAutopilotTelemetryForProject: (...args: any[]) => mockGetAutopilotTelemetryForProject(...args),
}));

// Import Server Pages and Metadata generators
import AdStudioPage, { generateMetadata as generateHubMeta } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/page';
import StoryboardPage, { generateMetadata as generateStoryboardMeta } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/storyboard/page';
import AutopilotPage, { generateMetadata as generateAutopilotMeta } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/autopilot/page';
import VideoExportPage, { generateMetadata as generateExportMeta } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/video-export/page';

// Import Interactive Client Components
import { AdStudioHub } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/ad-studio-hub';
import { StoryboardEditor } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/storyboard-editor';
import { AutopilotMonitor } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/autopilot-monitor';
import { VideoExportConsole } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/video-export-console';

describe('Ad Studio Adversarial Empirical Verification Suite', () => {
  const orgId = 'org-alpha';
  const projectId = 'proj-beta';
  const projectName = 'Pastel Pulse Alpha';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* =========================================================================
   * 1. Route Loading & Parameter Resolution (Server Page Components)
   * ========================================================================= */
  describe('Route Loading & Parameter Resolution', () => {
    const validSession = { uid: 'usr-101', email: 'marketer@growthos.io' };
    const validMembership = { organizationId: orgId, role: 'admin', status: 'active' };
    const validProjects = [
      { id: projectId, name: projectName },
      { id: 'proj-gamma', name: 'Secondary Pipeline' },
    ];

    it('resolves parameters asynchronously and renders AdStudioHub when authenticated & authorized', async () => {
      mockGetServerSession.mockResolvedValue(validSession);
      mockResolveOrgSessionContext.mockResolvedValue({ user: validSession, memberships: [validMembership] });
      mockFindActiveMembership.mockReturnValue(validMembership);
      mockListOrgProjects.mockResolvedValue(validProjects);

      const page = await AdStudioPage({
        params: Promise.resolve({ locale: 'en', orgId, projectId }),
      });

      expect(mockSetRequestLocale).toHaveBeenCalledWith('en');
      renderWithIntl(page);
      expect(screen.getByText('Synthesis Hub')).toBeInTheDocument();
      expect(screen.getByText('AI Ad Studio & Creative Synthesis')).toBeInTheDocument();
    });

    it('redirects unauthenticated requests to login with correct redirect URI', async () => {
      mockGetServerSession.mockResolvedValue(null);

      await expect(
        AdStudioPage({
          params: Promise.resolve({ locale: 'en', orgId, projectId }),
        }),
      ).rejects.toThrow('NEXT_REDIRECT:/en/login?from=%2Forgs%2Forg-alpha%2Fprojects%2Fproj-beta%2Fad-studio');

      expect(mockRedirect).toHaveBeenCalledWith(
        '/en/login?from=%2Forgs%2Forg-alpha%2Fprojects%2Fproj-beta%2Fad-studio',
      );
    });

    it('triggers notFound when active membership is absent', async () => {
      mockGetServerSession.mockResolvedValue(validSession);
      mockResolveOrgSessionContext.mockResolvedValue({ user: validSession, memberships: [] });
      mockFindActiveMembership.mockReturnValue(null);

      await expect(
        AdStudioPage({
          params: Promise.resolve({ locale: 'en', orgId, projectId }),
        }),
      ).rejects.toThrow('NEXT_NOT_FOUND');

      expect(mockNotFound).toHaveBeenCalled();
    });

    it('redirects to the first available project when requested project does not exist', async () => {
      mockGetServerSession.mockResolvedValue(validSession);
      mockResolveOrgSessionContext.mockResolvedValue({ user: validSession, memberships: [validMembership] });
      mockFindActiveMembership.mockReturnValue(validMembership);
      mockListOrgProjects.mockResolvedValue([
        { id: 'proj-first', name: 'First Project' },
      ]);

      await expect(
        AdStudioPage({
          params: Promise.resolve({ locale: 'en', orgId, projectId: 'non-existent-proj' }),
        }),
      ).rejects.toThrow('NEXT_REDIRECT:/en/orgs/org-alpha/projects/proj-first/ad-studio');

      expect(mockRedirect).toHaveBeenCalledWith(
        '/en/orgs/org-alpha/projects/proj-first/ad-studio',
      );
    });

    it('redirects to organization hub when zero projects exist in organization', async () => {
      mockGetServerSession.mockResolvedValue(validSession);
      mockResolveOrgSessionContext.mockResolvedValue({ user: validSession, memberships: [validMembership] });
      mockFindActiveMembership.mockReturnValue(validMembership);
      mockListOrgProjects.mockResolvedValue([]);

      await expect(
        AdStudioPage({
          params: Promise.resolve({ locale: 'en', orgId, projectId: 'non-existent-proj' }),
        }),
      ).rejects.toThrow('NEXT_REDIRECT:/en/orgs/org-alpha');

      expect(mockRedirect).toHaveBeenCalledWith('/en/orgs/org-alpha');
    });

    it('resolves parameters and renders StoryboardPage', async () => {
      mockGetServerSession.mockResolvedValue(validSession);
      mockResolveOrgSessionContext.mockResolvedValue({ user: validSession, memberships: [validMembership] });
      mockFindActiveMembership.mockReturnValue(validMembership);
      mockListOrgProjects.mockResolvedValue(validProjects);

      const page = await StoryboardPage({
        params: Promise.resolve({ locale: 'en', orgId, projectId }),
      });

      expect(mockSetRequestLocale).toHaveBeenCalledWith('en');
      renderWithIntl(page);
      expect(screen.getByText('Storyboard Editor')).toBeInTheDocument();
      expect(screen.getByText('Scene Breakdown & Timeline')).toBeInTheDocument();
    });

    it('resolves parameters and renders AutopilotPage', async () => {
      mockGetServerSession.mockResolvedValue(validSession);
      mockResolveOrgSessionContext.mockResolvedValue({ user: validSession, memberships: [validMembership] });
      mockFindActiveMembership.mockReturnValue(validMembership);
      mockListOrgProjects.mockResolvedValue(validProjects);

      const page = await AutopilotPage({
        params: Promise.resolve({ locale: 'en', orgId, projectId }),
      });

      expect(mockSetRequestLocale).toHaveBeenCalledWith('en');
      renderWithIntl(page);
      expect(screen.getByText('Autopilot Pipeline')).toBeInTheDocument();
      expect(screen.getByText('Autopilot Pipeline Monitor')).toBeInTheDocument();
    });

    it('resolves parameters and renders VideoExportPage', async () => {
      mockGetServerSession.mockResolvedValue(validSession);
      mockResolveOrgSessionContext.mockResolvedValue({ user: validSession, memberships: [validMembership] });
      mockFindActiveMembership.mockReturnValue(validMembership);
      mockListOrgProjects.mockResolvedValue(validProjects);

      const page = await VideoExportPage({
        params: Promise.resolve({ locale: 'en', orgId, projectId }),
      });

      expect(mockSetRequestLocale).toHaveBeenCalledWith('en');
      renderWithIntl(page);
      expect(screen.getByText('Video Assembly & Export')).toBeInTheDocument();
      expect(screen.getByText('Video Assembly & Export Console')).toBeInTheDocument();
    });

    it('generates metadata correctly across all 4 route endpoints', async () => {
      const hubMeta = await generateHubMeta({
        params: Promise.resolve({ locale: 'en', orgId, projectId }),
      });
      expect(hubMeta.title).toBe('AdStudioPage.metaTitle');

      const storyboardMeta = await generateStoryboardMeta({
        params: Promise.resolve({ locale: 'en', orgId, projectId }),
      });
      expect(storyboardMeta.title).toBe('AdStudioPage.storyboardMetaTitle');

      const autopilotMeta = await generateAutopilotMeta({
        params: Promise.resolve({ locale: 'en', orgId, projectId }),
      });
      expect(autopilotMeta.title).toBe('AdStudioPage.autopilotMetaTitle');

      const exportMeta = await generateExportMeta({
        params: Promise.resolve({ locale: 'en', orgId, projectId }),
      });
      expect(exportMeta.title).toBe('AdStudioPage.exportMetaTitle');
    });
  });

  /* =========================================================================
   * 2. State Toggles: Synthesis Mode & Creative Form (AdStudioHub)
   * ========================================================================= */
  describe('Synthesis Mode & State Toggles', () => {
    it('handles tone selection, channel selection toggling, and autopilot quick switch', () => {
      renderWithIntl(<AdStudioHub orgId={orgId} projectId={projectId} projectName={projectName} />);

      // Tone selection toggle
      const toneSelect = screen.getByRole('combobox') as HTMLSelectElement;
      expect(toneSelect.value).toBe('direct');
      fireEvent.change(toneSelect, { target: { value: 'storytelling' } });
      expect(toneSelect.value).toBe('storytelling');
      fireEvent.change(toneSelect, { target: { value: 'urgent' } });
      expect(toneSelect.value).toBe('urgent');

      // Channel pills toggle: uncheck Meta Reels
      const metaPill = screen.getByRole('button', { name: 'Meta Reels' });
      expect(metaPill.className).toContain('bg-pp-primary');
      fireEvent.click(metaPill);
      expect(metaPill.className).toContain('bg-pp-surface-container');
      // Toggle it back on
      fireEvent.click(metaPill);
      expect(metaPill.className).toContain('bg-pp-primary');

      // Autopilot quick switch toggle
      const autopilotSwitch = screen.getByRole('switch');
      expect(autopilotSwitch.getAttribute('aria-checked')).toBe('true');
      expect(screen.getByText('Autopilot Active')).toBeInTheDocument();

      fireEvent.click(autopilotSwitch);
      expect(autopilotSwitch.getAttribute('aria-checked')).toBe('false');
      expect(screen.getByText('Autopilot Paused')).toBeInTheDocument();

      fireEvent.click(autopilotSwitch);
      expect(autopilotSwitch.getAttribute('aria-checked')).toBe('true');
      expect(screen.getByText('Autopilot Active')).toBeInTheDocument();
    });

    it('filters creative gallery by format pills (all, video, feed, carousel)', () => {
      renderWithIntl(<AdStudioHub orgId={orgId} projectId={projectId} projectName={projectName} />);

      // All filter (default)
      expect(screen.getByText('No Creative Variations Synthesized Yet')).toBeInTheDocument();

      // Video filter
      const videoFilterBtn = screen.getByRole('button', { name: 'Video (9:16 / 16:9)' });
      fireEvent.click(videoFilterBtn);
      expect(screen.getByText('No Creative Variations Synthesized Yet')).toBeInTheDocument();

      // Feed filter
      const feedFilterBtn = screen.getByRole('button', { name: 'Feed Image (1:1)' });
      fireEvent.click(feedFilterBtn);
      expect(screen.getByText('No Creative Variations Synthesized Yet')).toBeInTheDocument();

      // Reset to All
      const allFilterBtn = screen.getByRole('button', { name: 'All Formats' });
      fireEvent.click(allFilterBtn);
      expect(screen.getByText('No Creative Variations Synthesized Yet')).toBeInTheDocument();
    });

    it('synthesizes new creative variant from custom audience and value proposition inputs', async () => {
      renderWithIntl(<AdStudioHub orgId={orgId} projectId={projectId} projectName={projectName} />);

      const audienceInput = screen.getByLabelText(/Target Audience \/ ICP/i);
      fireEvent.change(audienceInput, { target: { value: 'Fintech CFOs & Operations Leaders' } });

      const valuePropInput = screen.getByLabelText(/Core Value Proposition/i);
      fireEvent.change(valuePropInput, {
        target: { value: 'Eliminate reconciliation errors with automated ledger telemetry' },
      });

      const submitBtn = screen.getByRole('button', { name: /Synthesize Creative Variations/i });
      fireEvent.click(submitBtn);

      await waitFor(
        () => {
          expect(
            screen.getByText('Successfully generated 4 multi-angle creative concepts!'),
          ).toBeInTheDocument();
        },
        { timeout: 2500 },
      );

      // Verify new card with sliced value proposition was prepended to the gallery
      expect(
        screen.getByRole('heading', { name: /Eliminate reconciliation errors with/i }),
      ).toBeInTheDocument();
    });
  });

  /* =========================================================================
   * 3. State Toggles: Timeline Editing & Storyboard (StoryboardEditor)
   * ========================================================================= */
  describe('Timeline Editing & Storyboard Toggles', () => {
    it('toggles aspect ratios and duration presets', () => {
      renderWithIntl(<StoryboardEditor orgId={orgId} projectId={projectId} projectName={projectName} />);

      // Aspect ratios
      const ratio11 = screen.getByRole('button', { name: '1:1' });
      fireEvent.click(ratio11);
      expect(ratio11.className).toContain('bg-pp-primary');

      const ratio169 = screen.getByRole('button', { name: '16:9' });
      fireEvent.click(ratio169);
      expect(ratio169.className).toContain('bg-pp-primary');

      // Duration presets
      const dur15s = screen.getByRole('button', { name: '15s' });
      fireEvent.click(dur15s);
      expect(dur15s.className).toContain('bg-pp-inverse-surface');

      const dur60s = screen.getByRole('button', { name: '60s' });
      fireEvent.click(dur60s);
      expect(dur60s.className).toContain('bg-pp-inverse-surface');
    });

    it('switches between all 5 timeline scenes and updates the active scene editor', () => {
      renderWithIntl(<StoryboardEditor orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText('Editing Scene 1 of 5')).toBeInTheDocument();

      // Click Scene 3
      const scene3Card = screen.getByText('Scene 3: Solution Reveal');
      fireEvent.click(scene3Card);
      expect(screen.getByText('Editing Scene 3 of 5')).toBeInTheDocument();

      // Click Scene 5
      const scene5Card = screen.getByText('Scene 5: High-Converting CTA');
      fireEvent.click(scene5Card);
      expect(screen.getByText('Editing Scene 5 of 5')).toBeInTheDocument();

      // Click Scene 2
      const scene2Card = screen.getByText('Scene 2: Problem Agitation');
      fireEvent.click(scene2Card);
      expect(screen.getByText('Editing Scene 2 of 5')).toBeInTheDocument();
    });

    it('persists scene prompt and voiceover modifications across scene switches and saves', () => {
      renderWithIntl(<StoryboardEditor orgId={orgId} projectId={projectId} projectName={projectName} />);

      // Switch to Scene 2
      const scene2Card = screen.getByText('Scene 2: Problem Agitation');
      fireEvent.click(scene2Card);

      // Edit voiceover
      const voiceoverTextarea = screen.getByLabelText(/Voiceover \/ Audio Script/i);
      fireEvent.change(voiceoverTextarea, {
        target: { value: 'Modified voiceover for testing persistence across scene timeline switches.' },
      });

      // Switch to Scene 4 then back to Scene 2
      const scene4Card = screen.getByText('Scene 4: Social Proof & Metrics');
      fireEvent.click(scene4Card);
      expect(screen.getByText('Editing Scene 4 of 5')).toBeInTheDocument();

      fireEvent.click(scene2Card);
      expect(screen.getByText('Editing Scene 2 of 5')).toBeInTheDocument();
      expect(
        screen.getByDisplayValue('Modified voiceover for testing persistence across scene timeline switches.'),
      ).toBeInTheDocument();

      // Click save
      const saveBtn = screen.getByRole('button', { name: /Save Storyboard/i });
      fireEvent.click(saveBtn);
      expect(screen.getByText('Saved!')).toBeInTheDocument();
    });

    it('allows changing audio tracks and voice actors', () => {
      renderWithIntl(<StoryboardEditor orgId={orgId} projectId={projectId} projectName={projectName} />);

      const audioSelect = screen.getByLabelText(/Background Audio Track/i) as HTMLSelectElement;
      fireEvent.change(audioSelect, { target: { value: 'synthwave' } });
      expect(audioSelect.value).toBe('synthwave');

      const voiceSelect = screen.getByLabelText(/AI Voice Actor/i) as HTMLSelectElement;
      fireEvent.change(voiceSelect, { target: { value: 'marcus' } });
      expect(voiceSelect.value).toBe('marcus');
    });
  });

  /* =========================================================================
   * 4. State Toggles: Autopilot Rules & Guardrails (AutopilotMonitor)
   * ========================================================================= */
  describe('Autopilot Rules & Guardrails Toggles', () => {
    it('switches target channels and aspect ratios', () => {
      renderWithIntl(<AutopilotMonitor orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText('Autonomous Pipeline Operational')).toBeInTheDocument();

      // Switch target channel to Meta Reels
      const metaChannelBtn = screen.getByRole('button', { name: 'Meta Reels' });
      fireEvent.click(metaChannelBtn);
      expect(metaChannelBtn).toBeInTheDocument();

      // Switch aspect ratio to 1:1 Square
      const squareBtn = screen.getByRole('button', { name: '1:1 Square' });
      fireEvent.click(squareBtn);
      expect(squareBtn).toBeInTheDocument();
    });

    it('triggers emergency kill-switch into safe mode and restores operations', async () => {
      renderWithIntl(<AutopilotMonitor orgId={orgId} projectId={projectId} projectName={projectName} />);

      const killBtn = screen.getByRole('button', { name: /Emergency Kill-Switch/i });
      fireEvent.click(killBtn);

      // Verify emergency state
      await waitFor(() => {
        expect(screen.getByText('Autopilot Suspended (Emergency Safe Mode)')).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: /Emergency Kill-Switch/i })).toBeNull();

      // Resume from emergency safe mode
      const resumeBtn = screen.getByRole('button', { name: /Resume Autopilot/i });
      fireEvent.click(resumeBtn);

      await waitFor(() => {
        expect(screen.getByText('Autonomous Pipeline Operational')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /Emergency Kill-Switch/i })).toBeInTheDocument();
    });

    it('opens guardrails editor, updates daily cap, min ROAS, and max CPA, then saves', async () => {
      renderWithIntl(<AutopilotMonitor orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText('$5,000 / day')).toBeInTheDocument();
      expect(screen.getByText('2.5x')).toBeInTheDocument();
      expect(screen.getByText('$35')).toBeInTheDocument();

      // Open guardrails editor
      const adjustBtn = screen.getByRole('button', { name: /Adjust Guardrails/i });
      fireEvent.click(adjustBtn);

      const capInput = screen.getByDisplayValue('5000');
      fireEvent.change(capInput, { target: { value: '7500' } });

      const roasInput = screen.getByDisplayValue('2.5');
      fireEvent.change(roasInput, { target: { value: '3.1' } });

      const cpaInput = screen.getByDisplayValue('35');
      fireEvent.change(cpaInput, { target: { value: '45' } });

      // Save editor and confirm updated values in display
      const saveBtn = screen.getByRole('button', { name: /Save Guardrails/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('$7,500 / day')).toBeInTheDocument();
        expect(screen.getByText('3.1x')).toBeInTheDocument();
        expect(screen.getByText('$45')).toBeInTheDocument();
      });
    });
  });

  /* =========================================================================
   * 5. State Toggles: Export Formats & Assembly (VideoExportConsole)
   * ========================================================================= */
  describe('Export Formats & Console Toggles', () => {
    it('switches aspect ratio from preview projection pills', () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      // Initial aspect ratio
      expect(screen.getAllByText('9:16').length).toBeGreaterThan(0);

      // Switch to 1:1 via projection pill
      const squarePill = screen.getByRole('button', { name: '1:1' });
      fireEvent.click(squarePill);
      expect(screen.getAllByText('1:1').length).toBeGreaterThan(0);

      // Switch to 16:9 via projection pill
      const landscapePill = screen.getByRole('button', { name: '16:9' });
      fireEvent.click(landscapePill);
      expect(screen.getAllByText('16:9').length).toBeGreaterThan(0);

      // Switch back to 9:16
      const verticalPill = screen.getByRole('button', { name: '9:16' });
      fireEvent.click(verticalPill);
      expect(screen.getAllByText('9:16').length).toBeGreaterThan(0);
    });

    it('toggles captions and dynamic audio ducking guardrails', () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      const captionsSection = screen.getByText('Closed Captions Burn-in');
      expect(captionsSection).toBeInTheDocument();
      fireEvent.click(captionsSection);

      const duckingSection = screen.getByText('Dynamic Audio Ducking');
      expect(duckingSection).toBeInTheDocument();
      fireEvent.click(duckingSection);

      const safeZonesSection = screen.getByText('Safe Zones Verification');
      expect(safeZonesSection).toBeInTheDocument();
      fireEvent.click(safeZonesSection);
    });

    it('triggers video assembly and dispatches new job into render queue ledger', async () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      const exportBtn = screen.getByRole('button', { name: /Start Video Assembly & Export/i });
      fireEvent.click(exportBtn);

      await waitFor(
        () => {
          expect(screen.getByTestId('video-export-feedback')).toBeInTheDocument();
        },
        { timeout: 2500 },
      );

      // Dismiss notification
      const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
      fireEvent.click(dismissBtn);
      expect(screen.queryByTestId('video-export-feedback')).toBeNull();
    });

    it('handles CAPI direct sync actions for Meta and Google Ads', async () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      const pushBtn = screen.getByRole('button', { name: /Push & Dispatch to Ad Networks/i });
      fireEvent.click(pushBtn);

      await waitFor(
        () => {
          expect(screen.getByTestId('video-export-feedback')).toBeInTheDocument();
          expect(screen.getAllByText('CAPI Synced').length).toBeGreaterThan(0);
        },
        { timeout: 2000 },
      );
    });

    it('copies CDN URL with visual feedback transition to Copied', async () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      const copyButtons = screen.getAllByRole('button', { name: /Copy CDN/i });
      expect(copyButtons.length).toBeGreaterThan(0);

      fireEvent.click(copyButtons[0]);

      expect(screen.getByText('Copied')).toBeInTheDocument();

      await waitFor(
        () => {
          expect(screen.queryByText('Copied')).toBeNull();
        },
        { timeout: 3000 },
      );
    });
  });
});
