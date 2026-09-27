import { describe, expect, it } from 'vitest';
import { summarizeSessionReplayTemplate } from './session-replay-view';

describe('summarizeSessionReplayTemplate', () => {
  it('reads the tool from the host and whether rows are filtered per page', () => {
    expect(summarizeSessionReplayTemplate('https://clarity.microsoft.com/projects/view/X/impressions?Url={landing_page}')).toEqual({ tool: 'clarity', filtersByPage: true });
    expect(summarizeSessionReplayTemplate('https://insights.hotjar.com/sites/1/heatmaps')).toEqual({ tool: 'hotjar', filtersByPage: false });
    expect(summarizeSessionReplayTemplate('https://app.fullstory.com/ui/o/{landing_page}')).toEqual({ tool: 'fullstory', filtersByPage: true });
    expect(summarizeSessionReplayTemplate('https://replay.example.com/{landing_page}')).toEqual({ tool: 'other', filtersByPage: true });
  });

  it('has no tool when nothing is configured, or when the template is not a URL', () => {
    expect(summarizeSessionReplayTemplate(undefined)).toEqual({ tool: null, filtersByPage: false });
    expect(summarizeSessionReplayTemplate('   ')).toEqual({ tool: null, filtersByPage: false });
    expect(summarizeSessionReplayTemplate('not a url')).toEqual({ tool: 'other', filtersByPage: false });
  });

  it('does not take a look-alike host for a real tool', () => {
    expect(summarizeSessionReplayTemplate('https://clarity.microsoft.com.evil.example/x').tool).toBe('other');
  });
});
