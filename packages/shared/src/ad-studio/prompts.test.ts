import { describe, expect, it } from 'vitest';
import { buildSceneRewritePrompt, buildScriptPrompt, type AdStudioBriefInput } from './prompts';

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
    expect(prompt.system).toContain('Do not invent facts');
    expect(prompt.user).toContain('Frame: vertical (9:16)');
    expect(prompt.user).toContain('Ad language: Hebrew');
    expect(prompt.user).toContain('Requested length: 60 seconds');
    expect(prompt.user).toContain('Landing page: https://example.com/lawyers');
    expect(prompt.user).not.toContain('Context from the planning stage');
  });

  it('adds planning findings only when there are some', () => {
    const prompt = buildScriptPrompt(BRIEF, { audience: 'Solo lawyers', messagingAngles: ['Speed', 'Legal validity'], keywordThemes: [] });
    expect(prompt.user).toContain('Audience: Solo lawyers');
    expect(prompt.user).toContain('Messaging angles to build on: Speed; Legal validity');
    expect(prompt.user).not.toContain('What people search for');
  });
});

describe('buildSceneRewritePrompt', () => {
  it('shows the whole script as context and names the scene and the instruction', () => {
    const scenes = [
      { id: 'a', durationSeconds: 4, visualPrompt: 'A lawyer at a cluttered desk', voiceover: 'Too much paper?', onScreenText: '' },
      { id: 'b', durationSeconds: 6, visualPrompt: 'Phone showing a signature', voiceover: '', onScreenText: 'Signed' },
    ];
    const prompt = buildSceneRewritePrompt(BRIEF, scenes, 1, 'more energy');
    expect(prompt.user).toContain('1. [4s] A lawyer at a cluttered desk | VO: Too much paper?');
    expect(prompt.user).toContain('2. [6s] Phone showing a signature | Text: Signed');
    expect(prompt.user).toContain('Rewrite scene 2. Instruction: more energy');
    expect(prompt.system).toContain('Keep the scene at 6 seconds');
  });
});
