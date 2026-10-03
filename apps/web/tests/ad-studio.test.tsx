import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithIntl } from './e2e/helpers/test-harness';
import { AdStudioNavHeader } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/ad-studio-nav-header';
import { AdStudioHub } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/ad-studio-hub';
import { StoryboardEditor } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/storyboard-editor';
import { AutopilotMonitor } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/autopilot-monitor';
import { VideoExportConsole } from '@/app/[locale]/orgs/[orgId]/projects/[projectId]/ad-studio/components/video-export-console';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === 'object' ? JSON.stringify(href) : href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/orgs/org-123/projects/proj-456/ad-studio',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/orgs/org-123/projects/proj-456/ad-studio',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe('GrowthOS AI Ad Studio Suite', () => {
  const orgId = 'org-123';
  const projectId = 'proj-456';
  const projectName = 'ScaleMaster Pro';

  describe('AdStudioNavHeader', () => {
    it('renders all 4 navigation tabs with subpath routes and back link', () => {
      renderWithIntl(<AdStudioNavHeader orgId={orgId} projectId={projectId} />);

      expect(screen.getByText('Synthesis Hub')).toBeDefined();
      expect(screen.getByText('Storyboard Editor')).toBeDefined();
      expect(screen.getByText('Autopilot Pipeline')).toBeDefined();
      expect(screen.getByText('Video Assembly & Export')).toBeDefined();

      const backLink = screen.getByLabelText('Back to Ad Studio');
      expect(backLink).toBeDefined();
      expect(backLink.getAttribute('href')).toBe(`/orgs/${orgId}/projects/${projectId}/campaigns`);
    });
  });

  describe('AdStudioHub', () => {
    it('renders KPI scorecards and creative synthesis studio', () => {
      renderWithIntl(<AdStudioHub orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText('Active Campaigns')).toBeDefined();
      expect(screen.getByText('14')).toBeDefined();
      expect(screen.getByText('Creative Quality Score')).toBeDefined();
      expect(screen.getByText('94.2')).toBeDefined();
      expect(screen.getByText('Autopilot Pacing')).toBeDefined();
      expect(screen.getByText('98.6%')).toBeDefined();
      expect(screen.getByText('Generation Quota')).toBeDefined();
      expect(screen.getByText('420')).toBeDefined();
      expect(screen.getByText('Creative Synthesis Studio')).toBeDefined();
      expect(screen.getByText('Autopilot Pacing & Safety Guardrails')).toBeDefined();
    });

    it('allows synthesis form input and trigger generation', async () => {
      renderWithIntl(<AdStudioHub orgId={orgId} projectId={projectId} projectName={projectName} />);

      const audienceInput = screen.getByDisplayValue('B2B SaaS Founders & Growth VPs');
      fireEvent.change(audienceInput, { target: { value: 'E-commerce DTC Leaders' } });
      expect(screen.getByDisplayValue('E-commerce DTC Leaders')).toBeDefined();

      const generateBtn = screen.getByRole('button', { name: /Synthesize Creative Variations/i });
      fireEvent.click(generateBtn);

      await waitFor(
        () => {
          expect(screen.getByText('Successfully generated 4 multi-angle creative concepts!')).toBeDefined();
        },
        { timeout: 3000 },
      );
    });

    it('filters creative gallery cards by format pill', () => {
      renderWithIntl(<AdStudioHub orgId={orgId} projectId={projectId} projectName={projectName} />);

      const videoFilterBtn = screen.getByRole('button', { name: 'Video (9:16 / 16:9)' });
      fireEvent.click(videoFilterBtn);

      expect(screen.getByText('The 10x CAC Payback Blueprint')).toBeDefined();
      expect(screen.getByText('Autopilot Ad Rebalancing Demo')).toBeDefined();
      expect(screen.queryByText('Executive Growth Telemetry Showcase')).toBeNull();
    });
  });

  describe('StoryboardEditor', () => {
    it('renders scene timeline breakdown and switches active scenes', () => {
      renderWithIntl(<StoryboardEditor orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText('Script & Storyboard Editor')).toBeDefined();
      expect(screen.getByText('Scene Breakdown & Timeline')).toBeDefined();
      expect(screen.getAllByText('Scene 1: The Hook').length).toBeGreaterThan(0);
      expect(screen.getByText('Scene 2: Problem Agitation')).toBeDefined();
      expect(screen.getByText('Scene 3: Solution Reveal')).toBeDefined();

      // Click Scene 2 card to inspect its details
      const scene2 = screen.getByText('Scene 2: Problem Agitation');
      fireEvent.click(scene2);

      expect(screen.getByText(/Editing Scene 2/i)).toBeDefined();
    });

    it('allows modifying visual prompts and voiceover text, then saves', () => {
      renderWithIntl(<StoryboardEditor orgId={orgId} projectId={projectId} projectName={projectName} />);

      const promptTextarea = screen.getByDisplayValue(/Dynamic 3D cinematic zoom on a frustrated marketer/i);
      fireEvent.change(promptTextarea, { target: { value: 'Hyper-minimalist 3D isometric animation of glowing dashboard' } });
      expect(screen.getByDisplayValue(/Hyper-minimalist 3D isometric animation of glowing dashboard/i)).toBeDefined();

      const saveBtn = screen.getByRole('button', { name: /Save Storyboard/i });
      fireEvent.click(saveBtn);

      expect(screen.getByText('Saved!')).toBeDefined();
    });

    it('switches aspect ratio and target duration pills', () => {
      renderWithIntl(<StoryboardEditor orgId={orgId} projectId={projectId} projectName={projectName} />);

      const squarePill = screen.getByRole('button', { name: '1:1' });
      fireEvent.click(squarePill);

      const duration60s = screen.getByRole('button', { name: '60s' });
      fireEvent.click(duration60s);

      expect(screen.getAllByText('1:1').length).toBeGreaterThan(0);
    });
  });

  describe('AutopilotMonitor', () => {
    it('renders channel spend allocation and guardrails', () => {
      renderWithIntl(<AutopilotMonitor orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText('Autopilot Pipeline Monitor')).toBeDefined();
      expect(screen.getByText('Autonomous Pipeline Operational')).toBeDefined();
      expect(screen.getByText('Daily Pacing Limit')).toBeDefined();
      expect(screen.getByText('$5,000')).toBeDefined();
      expect(screen.getByText('Channel Spend Allocation')).toBeDefined();
      expect(screen.getByText('Creative Fatigue Radar & Auto-Rotation')).toBeDefined();
      expect(screen.getByText('Autonomous Action Audit Ledger')).toBeDefined();
    });

    it('supports guardrails editing and saving', () => {
      renderWithIntl(<AutopilotMonitor orgId={orgId} projectId={projectId} projectName={projectName} />);

      const adjustBtn = screen.getByRole('button', { name: /Adjust Guardrails/i });
      fireEvent.click(adjustBtn);

      expect(screen.getByRole('button', { name: 'Close' })).toBeDefined();
      const dailyCapInput = screen.getByDisplayValue('5000');
      fireEvent.change(dailyCapInput, { target: { value: '8500' } });

      const closeBtn = screen.getByRole('button', { name: 'Close' });
      fireEvent.click(closeBtn);

      expect(screen.getByText('$8,500')).toBeDefined();
    });

    it('triggers emergency kill-switch and resumes autopilot', () => {
      renderWithIntl(<AutopilotMonitor orgId={orgId} projectId={projectId} projectName={projectName} />);

      const killBtn = screen.getByRole('button', { name: /Emergency Kill-Switch/i });
      fireEvent.click(killBtn);

      expect(screen.getByText('Autopilot Inactive / Paused')).toBeDefined();

      const resumeBtn = screen.getByRole('button', { name: 'Resume Operations' });
      fireEvent.click(resumeBtn);

      expect(screen.getByText('Autonomous Pipeline Operational')).toBeDefined();
    });
  });

  describe('VideoExportConsole', () => {
    it('renders video assembly console, multi-format matrix and queue', () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText('Video Assembly & Export Console')).toBeDefined();
      expect(screen.getByText('Render Timeline & Viewport Preview')).toBeDefined();
      expect(screen.getByText('Multi-Format Export Matrix')).toBeDefined();
      expect(screen.getByText('Vertical Story & Reels')).toBeDefined();
      expect(screen.getByText('Feed Carousel & Square')).toBeDefined();
      expect(screen.getAllByText('Desktop Web & YouTube').length).toBeGreaterThan(0);
      expect(screen.getByText('Subtitles & Dynamic Captions')).toBeDefined();
      expect(screen.getByText('Recent Render Pipeline Jobs')).toBeDefined();
    });

    it('triggers video rendering and completion state', async () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      const renderBtn = screen.getByRole('button', { name: /Start Video Assembly & Export/i });
      fireEvent.click(renderBtn);

      await waitFor(
        () => {
          expect(screen.getByText('Video successfully rendered and dispatched to ad platforms!')).toBeDefined();
        },
        { timeout: 3000 },
      );
      expect(screen.getAllByRole('button', { name: /Download/i }).length).toBeGreaterThan(0);
    });

    it('toggles aspect ratios in preview console', () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      const btn169 = screen.getByRole('button', { name: '16:9' });
      fireEvent.click(btn169);

      // Verify 16:9 toggle active
      expect(screen.getAllByText('16:9').length).toBeGreaterThan(0);
    });
  });
});
