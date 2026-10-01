import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { renderWithIntl } from '@/tests/e2e/helpers/test-harness';
import heMessages from '@/messages/he.json';
import type { AdStudioClipView } from '@/lib/ad-studio/view';
import { ClipQaNote } from './clip-qa-note';

function clip(qa: AdStudioClipView['qa'], status: AdStudioClipView['status'] = 'ready'): AdStudioClipView {
  return {
    id: 'c1',
    sceneId: 's1',
    version: 1,
    kind: 'render',
    status,
    failureReason: null,
    sceneFingerprint: 'fp',
    durationSeconds: 5,
    parentClipId: null,
    instruction: null,
    requestedOn: '2026-10-01T10:00:00.000Z',
    completedOn: '2026-10-01T10:02:00.000Z',
    qa,
  };
}

describe('ClipQaNote', () => {
  it('says the check is running for a ready clip not checked yet, and shows nothing while it renders', () => {
    const { unmount } = renderWithIntl(<ClipQaNote clip={clip(null)} />, { locale: 'en' });
    expect(screen.getByTestId('ad-studio-clip-qa')).toHaveAttribute('data-qa', 'pending');
    expect(screen.getByText('AI check running…')).toBeInTheDocument();
    unmount();
    renderWithIntl(<ClipQaNote clip={clip(null, 'generating')} />, { locale: 'en' });
    expect(screen.queryByTestId('ad-studio-clip-qa')).toBeNull();
  });

  it('lists the major problems with their time, keeps small notes and what was heard one click away', () => {
    renderWithIntl(
      <ClipQaNote
        clip={clip({
          status: 'issues',
          issues: [
            { kind: 'audio', severity: 'major', detail: 'Stutter on the first word', atSeconds: 0.4 },
            { kind: 'visual', severity: 'major', detail: 'Gibberish letters on the phone screen', atSeconds: 3 },
            { kind: 'visual', severity: 'minor', detail: 'Slight blur', atSeconds: null },
          ],
          transcript: 'ma-ma-alim mismach',
          checkedOn: '2026-10-01T10:03:00.000Z',
        })}
      />,
      { locale: 'en' },
    );
    expect(screen.getByText('The AI check found 2 problems')).toBeInTheDocument();
    expect(screen.getByText('Stutter on the first word')).toBeInTheDocument();
    expect(screen.getByText('at 0.4s')).toBeInTheDocument();
    expect(screen.getByText('Gibberish letters on the phone screen')).toBeInTheDocument();
    expect(screen.getByText(/Re-render the scene/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('1 small note'));
    expect(screen.getByText('Slight blur')).toBeVisible();
    fireEvent.click(screen.getByText('What the AI heard'));
    expect(screen.getByText('ma-ma-alim mismach')).toBeVisible();
  });

  it('shows a passed check, and a check that was off or could not run, in Hebrew too', () => {
    const { unmount } = renderWithIntl(<ClipQaNote clip={clip({ status: 'passed', issues: [], transcript: null, checkedOn: null })} />, { locale: 'he' });
    expect(screen.getByText(heMessages.AdStudio.video.qa.passed)).toBeInTheDocument();
    unmount();
    const off = renderWithIntl(<ClipQaNote clip={clip({ status: 'skipped', issues: [], transcript: null, checkedOn: null })} />, { locale: 'he' });
    expect(screen.getByText(heMessages.AdStudio.video.qa.skipped)).toBeInTheDocument();
    off.unmount();
    renderWithIntl(<ClipQaNote clip={clip({ status: 'error', issues: [], transcript: null, checkedOn: null })} />, { locale: 'en' });
    expect(screen.getByText('The AI check could not run for this clip')).toBeInTheDocument();
  });
});
