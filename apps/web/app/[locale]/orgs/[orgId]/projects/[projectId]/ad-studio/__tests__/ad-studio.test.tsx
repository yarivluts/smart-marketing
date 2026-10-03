import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '../../../../../../../../tests/e2e/helpers/test-harness';
import { AdStudioNavHeader } from '../components/ad-studio-nav-header';
import { AdStudioHub } from '../components/ad-studio-hub';
import { StoryboardEditor } from '../components/storyboard-editor';
import { AutopilotMonitor } from '../components/autopilot-monitor';
import { VideoExportConsole } from '../components/video-export-console';

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

      expect(screen.getByText('Creative Pipeline & Studio')).toBeDefined();
      expect(screen.getByText('Storyboard & Script')).toBeDefined();
      expect(screen.getByText('Autopilot Monitor')).toBeDefined();
      expect(screen.getByText('Video Assembly & Export')).toBeDefined();

      const backLink = screen.getByLabelText('Back to Campaigns & Ad Cockpit');
      expect(backLink).toBeDefined();
      expect(backLink.getAttribute('href')).toBe(`/orgs/${orgId}/projects/${projectId}/campaigns`);
    });
  });

  describe('AdStudioHub', () => {
    it('renders KPI scorecards and active project header', () => {
      renderWithIntl(<AdStudioHub orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText(projectName)).toBeDefined();
      expect(screen.getByText('Predicted Aggregate ROAS')).toBeDefined();
      expect(screen.getByText('3.84x')).toBeDefined();
      expect(screen.getByText('Avg 3s Hook Rate')).toBeDefined();
      expect(screen.getByText('Active Video Creatives')).toBeDefined();
      expect(screen.getByText('Autopilot Guardrails')).toBeDefined();
    });

    it('allows synthesis form input and trigger generation', () => {
      renderWithIntl(<AdStudioHub orgId={orgId} projectId={projectId} projectName={projectName} />);

      const audienceInput = screen.getByDisplayValue('B2B SaaS Founders & Growth VPs');
      fireEvent.change(audienceInput, { target: { value: 'E-commerce DTC Leaders' } });
      expect(screen.getByDisplayValue('E-commerce DTC Leaders')).toBeDefined();

      const generateBtn = screen.getByRole('button', { name: /Synthesize Video & Ad Creative Variants/i });
      fireEvent.click(generateBtn);

      expect(screen.getByText(/Successfully synthesized 2 new video variants!/i)).toBeDefined();
    });

    it('filters creative gallery cards by format pill', () => {
      renderWithIntl(<AdStudioHub orgId={orgId} projectId={projectId} projectName={projectName} />);

      const videoFilterBtn = screen.getByRole('button', { name: 'Video Reels (9:16)' });
      fireEvent.click(videoFilterBtn);

      expect(screen.getByText('Founder Story: Manual CAC Hell to Autopilot')).toBeDefined();
      expect(screen.getByText('Interactive ROI Calculator Teaser')).toBeDefined();
    });
  });

  describe('StoryboardEditor', () => {
    it('renders scene timeline breakdown and switches active scenes', () => {
      renderWithIntl(<StoryboardEditor orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText('Script & Storyboard Editor')).toBeDefined();
      expect(screen.getByText('Scene Breakdown & Timeline')).toBeDefined();
      expect(screen.getByText('Scene 1: The Hook')).toBeDefined();
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

      expect(screen.getByText(/Saved & Ready for Assembly/i)).toBeDefined();
    });

    it('switches aspect ratio and target duration pills', () => {
      renderWithIntl(<StoryboardEditor orgId={orgId} projectId={projectId} projectName={projectName} />);

      const squarePill = screen.getByRole('button', { name: '1:1 Square Feed' });
      fireEvent.click(squarePill);

      const duration60s = screen.getByRole('button', { name: '60 Seconds (Deep Demo)' });
      fireEvent.click(duration60s);

      expect(screen.getByText(/1:1/)).toBeDefined();
    });
  });

  describe('AutopilotMonitor', () => {
    it('renders channel spend allocation and guardrails', () => {
      renderWithIntl(<AutopilotMonitor orgId={orgId} projectId={projectId} projectName={projectName} />);

      expect(screen.getByText('Autopilot Pipeline Monitor')).toBeDefined();
      expect(screen.getByText('Autonomous Pipeline Operational')).toBeDefined();
      expect(screen.getByText('Daily Pacing Limit')).toBeDefined();
      expect(screen.getByText('$5,000 / day')).toBeDefined();
      expect(screen.getByText('Channel Spend Allocation')).toBeDefined();
      expect(screen.getByText('Creative Fatigue Radar & Auto-Rotation')).toBeDefined();
      expect(screen.getByText('Autonomous Action Audit Ledger')).toBeDefined();
    });

    it('supports guardrails editing and saving', () => {
      renderWithIntl(<AutopilotMonitor orgId={orgId} projectId={projectId} projectName={projectName} />);

      const adjustBtn = screen.getByRole('button', { name: /Adjust Guardrails/i });
      fireEvent.click(adjustBtn);

      expect(screen.getByText(/Save Guardrails/i)).toBeDefined();
      const dailyCapInput = screen.getByDisplayValue('5000');
      fireEvent.change(dailyCapInput, { target: { value: '8500' } });

      const saveBtn = screen.getByRole('button', { name: /Save Guardrails/i });
      fireEvent.click(saveBtn);

      expect(screen.getByText('$8,500 / day')).toBeDefined();
    });

    it('triggers emergency kill-switch and resumes autopilot', () => {
      renderWithIntl(<AutopilotMonitor orgId={orgId} projectId={projectId} projectName={projectName} />);

      const killBtn = screen.getByRole('button', { name: /Emergency Kill-Switch/i });
      fireEvent.click(killBtn);

      expect(screen.getByText('Autopilot Suspended (Emergency Safe Mode)')).toBeDefined();

      const resumeBtn = screen.getByRole('button', { name: /Resume Autopilot/i });
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
      expect(screen.getByText('Desktop Web & YouTube')).toBeDefined();
      expect(screen.getByText('Subtitles & Dynamic Captions')).toBeDefined();
      expect(screen.getByText('Recent Render Pipeline Jobs')).toBeDefined();
    });

    it('triggers video rendering and completion state', () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      const renderBtn = screen.getByRole('button', { name: /Start Video Assembly & Export/i });
      fireEvent.click(renderBtn);

      expect(screen.getByText('Video successfully rendered and dispatched to ad platforms!')).toBeDefined();
      expect(screen.getByRole('button', { name: /Download Master MP4/i })).toBeDefined();
    });

    it('toggles aspect ratios in preview console', () => {
      renderWithIntl(<VideoExportConsole orgId={orgId} projectId={projectId} projectName={projectName} />);

      const btn169 = screen.getByRole('button', { name: '16:9 Landscape' });
      fireEvent.click(btn169);

      expect(screen.getByText('1920x1080 (16:9)')).toBeDefined();
    });
  });
});
