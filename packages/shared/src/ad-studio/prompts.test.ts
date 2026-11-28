import { describe, expect, it } from 'vitest';
import { buildSceneRewritePrompt, buildScriptPrompt, buildScriptRevisePrompt, type AdStudioBriefInput } from './prompts';

const BRIEF: AdStudioBriefInput = {
  name: 'Sign in 30 seconds',
  objective: 'Trial signups from small law firms',
  productDescription: 'EasySign - e-signatures for lawyers',
  landingPageUrl: 'https://example.com/lawyers',
  format: 'vertical',
  language: 'he',
  targetSeconds: 90,
};

describe('buildScriptPrompt', () => {
  it('states the hard limits, the frame and the ad language, and caps the requested length at 60 seconds', () => {
    const prompt = buildScriptPrompt(BRIEF);
    expect(prompt.system).toContain('at most 60 seconds');
    expect(prompt.system).toContain('3-10 whole seconds');
    expect(prompt.system).toContain('Never invent facts');
    // A Hebrew ad gets the Hebrew writing rules and a narration budget in words per second.
    expect(prompt.system).toContain('plural imperative');
    expect(prompt.system).toContain('2.2 spoken words per second');
    expect(prompt.user).toContain('Frame: vertical (9:16)');
    expect(prompt.user).toContain('Ad language: Hebrew');
    expect(prompt.user).toContain('Requested length: 60 seconds');
    expect(prompt.user).toContain('Landing page: https://example.com/lawyers');
    expect(prompt.user).not.toContain('Context from the planning stage');
  });

  it('adds planning findings and general video instructions only when there are some', () => {
    const prompt = buildScriptPrompt(
      { ...BRIEF, videoInstructions: 'Characters should look Israeli' },
      { audience: 'Solo lawyers', messagingAngles: ['Speed', 'Legal validity'], keywordThemes: [] },
    );
    expect(prompt.user).toContain('Audience: Solo lawyers');
    expect(prompt.user).toContain('Messaging angles to build on: Speed; Legal validity');
    expect(prompt.user).not.toContain('What people search for');
    expect(prompt.system).toContain("Follow the general video instructions in <editor_request> across every scene's visualPrompt");
    expect(prompt.user).toContain(['General video instructions (apply to every scene):', '<editor_request>', 'Characters should look Israeli', '</editor_request>'].join('\n'));
  });
});

describe('buildSceneRewritePrompt', () => {
  it('shows the whole script as context and names the scene and the instruction', () => {
    const scenes = [
      { id: 'a', durationSeconds: 4, visualPrompt: 'A lawyer at a cluttered desk', voiceover: 'Too much paper?', onScreenText: '' },
      { id: 'b', durationSeconds: 6, visualPrompt: 'Phone showing a signature', voiceover: '', onScreenText: 'Signed' },
    ];
    const prompt = buildSceneRewritePrompt({ ...BRIEF, videoInstructions: 'Israeli look' }, scenes, 1, 'more energy', { audience: 'Solo lawyers', messagingAngles: ['Speed'] });
    expect(prompt.user).toContain('1. [4s] A lawyer at a cluttered desk | VO: Too much paper?');
    expect(prompt.user).toContain('2. [6s] Phone showing a signature | Text: Signed');
    expect(prompt.user).toContain(['General video instructions (apply to every scene):', '<editor_request>', 'Israeli look', '</editor_request>'].join('\n'));
    expect(prompt.user).toContain(['Rewrite scene 2 as the editor asks:', '<editor_request>', 'more energy', '</editor_request>'].join('\n'));
    // The rewrite keeps the plan's strategy and the shared rules.
    expect(prompt.user).toContain('Audience: Solo lawyers');
    expect(prompt.user).toContain('Messaging angles: Speed');
    expect(prompt.system).toContain('Never invent facts');
    expect(prompt.system).toContain("Follow the general video instructions in <editor_request> across every scene's visualPrompt");
    expect(prompt.system).toContain('<editor_request>');
    expect(prompt.system).toContain('Keep the scene at 6 seconds');
  });
});

describe('buildScriptRevisePrompt', () => {
  it('instructs preserving unchanged scenes verbatim and wraps the instruction', () => {
    const scenes = [
      { id: 'a', durationSeconds: 5, visualPrompt: 'Office scene', voiceover: 'Save time', onScreenText: '' },
      { id: 'b', durationSeconds: 5, visualPrompt: 'Happy customer', voiceover: 'Try today', onScreenText: 'Start' },
    ];
    const prompt = buildScriptRevisePrompt(BRIEF, scenes, 'Make the opening faster and add a price mention', { audience: 'Lawyers' });
    expect(prompt.system).toContain('Preserve any scene that does NOT need to change verbatim');
    expect(prompt.user).toContain('1. [5s] Office scene | VO: Save time');
    expect(prompt.user).toContain('<editor_request>\nMake the opening faster and add a price mention\n</editor_request>');
    expect(prompt.user).toContain('Audience: Lawyers');
  });
});
